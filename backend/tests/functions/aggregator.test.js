/**
 * Tests for backend/functions/aggregator.js
 *
 * Covers the DynamoDB Stream consumer:
 *   - happy path: one scan INSERT + one click INSERT + one INSERT without a
 *     country all translate to the expected UpdateItem calls on AggregatesTable
 *     and an empty batchItemFailures.
 *   - MODIFY / REMOVE records are skipped.
 *   - a transient UpdateItem failure surfaces as an entry in batchItemFailures
 *     (itemIdentifier = eventID) so the Lambda partial-batch response retries
 *     only the bad record.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const { setEnv, restoreEnv } = require('../helpers');
const { resetStubs } = require('../stubs');

const ddbMock = mockClient(DynamoDBDocumentClient);

/**
 * Build a synthetic DynamoDB Stream INSERT record. The NewImage is in DDB
 * attribute-value format (S for strings etc) — the aggregator uses
 * `@aws-sdk/util-dynamodb` to unmarshall it back to a plain object.
 */
const insertRecord = (eventID, newImage) => ({
  eventID,
  eventName: 'INSERT',
  dynamodb: { NewImage: newImage },
});

const stringMap = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = { S: String(v) };
  }
  return out;
};

beforeEach(() => {
  ddbMock.reset();
  setEnv({ AGGREGATES_TABLE_NAME: 'AggregatesTable' });
  resetStubs();
});

afterEach(() => {
  resetStubs();
  restoreEnv();
});

test('aggregator bumps DT/DC/DD counters for a scan INSERT with country', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const { handler } = require('../../functions/aggregator');

  const record = insertRecord('evt-scan-1', stringMap({
    pk: 'QR#qr-1',
    sk: 'S#2026-04-20T10:00:00.000Z#e-1',
    qrId: 'qr-1',
    eventId: 'e-1',
    ts: '2026-04-20T10:00:00.000Z',
    country: 'US',
    deviceType: 'mobile',
  }));

  const res = await handler({ Records: [record] });
  assert.deepEqual(res, { batchItemFailures: [] });

  const calls = ddbMock.commandCalls(UpdateCommand);
  assert.equal(calls.length, 3);
  const keys = calls.map((c) => c.args[0].input.Key);
  // Order within a record is not guaranteed (Promise.all), so sort stringified keys.
  const serialized = keys.map((k) => `${k.pk}|${k.sk}`).sort();
  assert.deepEqual(serialized, [
    'QR#qr-1|DC#2026-04-20#US',
    'QR#qr-1|DD#2026-04-20#mobile',
    'QR#qr-1|DT#2026-04-20',
  ]);

  // Each call uses ADD count :one and SETs expiresAt only if missing.
  for (const c of calls) {
    const input = c.args[0].input;
    assert.equal(input.TableName, 'AggregatesTable');
    assert.equal(
      input.UpdateExpression,
      'ADD #count :one SET #expires = if_not_exists(#expires, :expires)',
    );
    assert.deepEqual(input.ExpressionAttributeNames, { '#count': 'count', '#expires': 'expiresAt' });
    assert.equal(input.ExpressionAttributeValues[':one'], 1);
    assert.equal(typeof input.ExpressionAttributeValues[':expires'], 'number');
    assert.ok(input.ExpressionAttributeValues[':expires'] > Math.floor(Date.now() / 1000));
  }
});

test('aggregator handles a click INSERT and a record missing country (defaults deviceType=unknown)', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const { handler } = require('../../functions/aggregator');

  const clickRecord = insertRecord('evt-click-1', stringMap({
    pk: 'LINK#qr-2#primary',
    sk: 'C#2026-04-19T08:00:00.000Z#e-2',
    qrId: 'qr-2',
    linkKey: 'primary',
    ts: '2026-04-19T08:00:00.000Z',
    country: 'CA',
    deviceType: 'desktop',
  }));

  const scanNoCountry = insertRecord('evt-scan-2', stringMap({
    pk: 'QR#qr-3',
    sk: 'S#2026-04-19T09:00:00.000Z#e-3',
    qrId: 'qr-3',
    ts: '2026-04-19T09:00:00.000Z',
    // country intentionally omitted
    // deviceType intentionally omitted → should default to 'unknown'
  }));

  const res = await handler({ Records: [clickRecord, scanNoCountry] });
  assert.deepEqual(res, { batchItemFailures: [] });

  const calls = ddbMock.commandCalls(UpdateCommand);
  // clickRecord: 3 (DT + DC + DD). scanNoCountry: 2 (DT + DD with 'unknown', no DC).
  assert.equal(calls.length, 5);
  const serialized = calls.map((c) => {
    const k = c.args[0].input.Key;
    return `${k.pk}|${k.sk}`;
  }).sort();
  assert.deepEqual(serialized, [
    'LINK#qr-2#primary|DC#2026-04-19#CA',
    'LINK#qr-2#primary|DD#2026-04-19#desktop',
    'LINK#qr-2#primary|DT#2026-04-19',
    'QR#qr-3|DD#2026-04-19#unknown',
    'QR#qr-3|DT#2026-04-19',
  ]);
});

test('aggregator ignores MODIFY and REMOVE records', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const { handler } = require('../../functions/aggregator');

  const modify = {
    eventID: 'evt-mod',
    eventName: 'MODIFY',
    dynamodb: {
      NewImage: stringMap({
        pk: 'QR#qr-4', ts: '2026-04-20T00:00:00.000Z', country: 'US', deviceType: 'mobile',
      }),
    },
  };
  const remove = {
    eventID: 'evt-rem',
    eventName: 'REMOVE',
    dynamodb: {},
  };

  const res = await handler({ Records: [modify, remove] });
  assert.deepEqual(res, { batchItemFailures: [] });
  assert.equal(ddbMock.commandCalls(UpdateCommand).length, 0);
});

test('aggregator reports eventID in batchItemFailures when an UpdateItem fails', async () => {
  // One good record, one whose UpdateItem always rejects.
  const goodRecord = insertRecord('evt-ok', stringMap({
    pk: 'QR#qr-good',
    ts: '2026-04-20T00:00:00.000Z',
    country: 'US',
    deviceType: 'mobile',
  }));
  const badRecord = insertRecord('evt-bad', stringMap({
    pk: 'QR#qr-bad',
    ts: '2026-04-20T00:00:00.000Z',
    country: 'US',
    deviceType: 'mobile',
  }));

  ddbMock.on(UpdateCommand).callsFake((input) => {
    if (input?.Key?.pk === 'QR#qr-bad') {
      return Promise.reject(new Error('throttled'));
    }
    return Promise.resolve({});
  });

  const { handler } = require('../../functions/aggregator');
  const res = await handler({ Records: [goodRecord, badRecord] });
  assert.deepEqual(res, { batchItemFailures: [{ itemIdentifier: 'evt-bad' }] });
});

test('aggregator skips records with malformed NewImage without failing the batch', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const { handler } = require('../../functions/aggregator');

  // Missing ts → no date → no commands emitted, no failure.
  const noTs = insertRecord('evt-no-ts', stringMap({ pk: 'QR#qr-5', country: 'US' }));
  // Missing pk → also skipped.
  const noPk = insertRecord('evt-no-pk', stringMap({ ts: '2026-04-20T00:00:00.000Z', country: 'US' }));

  const res = await handler({ Records: [noTs, noPk] });
  assert.deepEqual(res, { batchItemFailures: [] });
  assert.equal(ddbMock.commandCalls(UpdateCommand).length, 0);
});
