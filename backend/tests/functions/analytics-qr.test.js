/**
 * Tests for backend/functions/analytics-qr.js
 *
 * Covers GET /analytics/qrs/{qrId}:
 *   - happy path: 200 with bucketed byDay counts derived from AggregatesTable.
 *   - 404 when the QR doesn't belong to the caller.
 *
 * The handler now issues three QueryCommand calls per QR (daily totals +
 * country breakdown + device breakdown) against AggregatesTable. Tests route
 * each Query by the :from expression attribute value prefix so we can return
 * an appropriate shape per aggregate kind.
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

/** Route AggregatesTable Query calls by their :from prefix. */
const routeAggregateQuery = ({ daily = [], country = [], device = [] }) => (input) => {
  const from = input?.ExpressionAttributeValues?.[':from'] ?? '';
  if (from.startsWith('DT#')) return Promise.resolve({ Items: daily });
  if (from.startsWith('DC#')) return Promise.resolve({ Items: country });
  if (from.startsWith('DD#')) return Promise.resolve({ Items: device });
  return Promise.resolve({ Items: [] });
};

beforeEach(() => {
  ddbMock.reset();
  setEnv({
    APP_TABLE_NAME: 'AppTable',
    EVENTS_TABLE_NAME: 'EventsTable',
    AGGREGATES_TABLE_NAME: 'AggregatesTable',
  });
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

  // AggregatesTable: two scans aggregated on 2025-03-01. By country: US=1, CA=1.
  // By device: mobile=1, desktop=1.
  ddbMock.on(QueryCommand).callsFake(routeAggregateQuery({
    daily: [
      { pk: 'QR#qr-1', sk: 'DT#2025-03-01', count: 2 },
    ],
    country: [
      { pk: 'QR#qr-1', sk: 'DC#2025-03-01#US', count: 1 },
      { pk: 'QR#qr-1', sk: 'DC#2025-03-01#CA', count: 1 },
    ],
    device: [
      { pk: 'QR#qr-1', sk: 'DD#2025-03-01#mobile', count: 1 },
      { pk: 'QR#qr-1', sk: 'DD#2025-03-01#desktop', count: 1 },
    ],
  }));

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
  // byCountry carries the two scan countries.
  assert.equal(body.byCountry.length, 2);
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
