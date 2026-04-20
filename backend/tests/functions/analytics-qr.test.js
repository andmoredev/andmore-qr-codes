/**
 * Tests for backend/functions/analytics-qr.js
 *
 * Covers GET /analytics/qrs/{qrId}:
 *   - happy path: 200 with bucketed byDay counts for a direct-type QR
 *   - 404 when the QR doesn't belong to the caller
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const { assertCors, authEvent, setEnv, restoreEnv } = require('../helpers');
const { resetStubs } = require('../stubs');

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  setEnv({ APP_TABLE_NAME: 'AppTable', EVENTS_TABLE_NAME: 'EventsTable' });
  resetStubs();
});

afterEach(() => {
  resetStubs();
  restoreEnv();
});

test('analytics-qr returns 200 with bucketed byDay counts for a direct QR', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      pk: 'USER#user-1',
      sk: 'QR#qr-1',
      qrId: 'qr-1',
      userId: 'user-1',
      type: 'direct',
      destinationUrl: 'https://x.example/',
      enabled: true,
      currentVersion: 1,
    },
  });
  // queryScans call → return two scans on the same day.
  ddbMock.on(QueryCommand).resolves({
    Items: [
      { qrId: 'qr-1', ts: '2025-03-01T10:00:00.000Z', country: 'US', deviceType: 'mobile' },
      { qrId: 'qr-1', ts: '2025-03-01T11:00:00.000Z', country: 'CA', deviceType: 'desktop' },
    ],
  });

  const { handler } = require('../../functions/analytics-qr');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { qrId: 'qr-1' },
    queryStringParameters: { from: '2025-03-01', to: '2025-03-02' },
  }));

  assert.equal(res.statusCode, 200);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.qrId, 'qr-1');
  assert.equal(body.totalScans, 2);
  assert.equal(body.totalClicks, 0);

  // byDay should contain two buckets (2025-03-01 with 2, 2025-03-02 with 0).
  assert.deepEqual(body.byDay, [
    { bucket: '2025-03-01', count: 2 },
    { bucket: '2025-03-02', count: 0 },
  ]);
  // byDevice has 2 entries sorted desc.
  assert.equal(body.byDevice.length, 2);
});

test('analytics-qr returns 404 when the QR is not owned by the caller', async () => {
  ddbMock.on(GetCommand).resolves({});

  const { handler } = require('../../functions/analytics-qr');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { qrId: 'someone-elses' },
  }));

  assert.equal(res.statusCode, 404);
  assertCors(res);
});
