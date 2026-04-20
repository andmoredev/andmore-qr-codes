/**
 * Tests for backend/functions/analytics-summary.js
 *
 * Covers GET /analytics/summary:
 *   - happy path: 200 with totals, recent items and a 31-day scansByDay bucket.
 *
 * The handler now reads from AggregatesTable. For the happy-path test we feed
 * the first two QueryCommand calls from listUserQrs/listUserPages and then
 * route every subsequent Query call (they target AggregatesTable) by the
 * :from prefix so each kind returns the appropriate synthetic shape.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const { assertCors, authEvent, setEnv, restoreEnv } = require('../helpers');
const { resetStubs } = require('../stubs');

const ddbMock = mockClient(DynamoDBDocumentClient);

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

test('analytics-summary happy path returns a DashboardSummary with recent and bucketed data', async () => {
  const qrQueryResult = {
    Items: [
      { qrId: 'qr-1', userId: 'user-1', name: 'QR A', type: 'direct', updatedAt: '2025-03-01T00:00:00.000Z' },
      { qrId: 'qr-2', userId: 'user-1', name: 'QR B', type: 'direct', updatedAt: '2025-02-01T00:00:00.000Z' },
    ],
  };
  const pageQueryResult = {
    Items: [
      {
        pageId: 'page-1',
        userId: 'user-1',
        slug: 'me',
        displayName: 'Me',
        status: 'published',
        updatedAt: '2025-03-05T00:00:00.000Z',
      },
    ],
  };

  // First two Query calls come from Promise.all([listUserQrs, listUserPages]).
  // All subsequent Query calls hit AggregatesTable. Return empty aggregates so
  // totals are zero and the 31-day scansByDay is all-zeros.
  let call = 0;
  ddbMock.on(QueryCommand).callsFake(() => {
    call += 1;
    if (call === 1) return qrQueryResult;
    if (call === 2) return pageQueryResult;
    return { Items: [] };
  });

  const { handler } = require('../../functions/analytics-summary');

  const res = await handler(authEvent({ userId: 'user-1' }));

  assert.equal(res.statusCode, 200);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.totalQrs, 2);
  assert.equal(body.totalPages, 1);
  assert.equal(body.scansLast30Days, 0);
  assert.equal(body.clicksLast30Days, 0);
  assert.equal(body.recentQrs.length, 2);
  assert.equal(body.recentQrs[0].qrId, 'qr-1'); // sorted by updatedAt desc
  assert.equal(body.recentPages.length, 1);
  // scansByDay should enumerate the 31-day window inclusive.
  assert.equal(body.scansByDay.length, 31);
});

test('analytics-summary sums scan aggregates across multiple QRs', async () => {
  const qrQueryResult = {
    Items: [
      { qrId: 'qr-a', userId: 'user-1', name: 'A', type: 'direct', updatedAt: '2025-03-01T00:00:00.000Z' },
      { qrId: 'qr-b', userId: 'user-1', name: 'B', type: 'direct', updatedAt: '2025-02-01T00:00:00.000Z' },
    ],
  };
  const pageQueryResult = { Items: [] };

  // Fixed date string guaranteed to fall inside the 30-day window.
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  let call = 0;
  ddbMock.on(QueryCommand).callsFake((input) => {
    call += 1;
    if (call === 1) return qrQueryResult;
    if (call === 2) return pageQueryResult;

    const pk = input?.ExpressionAttributeValues?.[':pk'] ?? '';
    const from = input?.ExpressionAttributeValues?.[':from'] ?? '';

    if (from.startsWith('DT#')) {
      if (pk === 'QR#qr-a') return { Items: [{ pk, sk: `DT#${todayIso}`, count: 3 }] };
      if (pk === 'QR#qr-b') return { Items: [{ pk, sk: `DT#${todayIso}`, count: 5 }] };
    }
    if (from.startsWith('DC#')) {
      if (pk === 'QR#qr-a') return { Items: [{ pk, sk: `DC#${todayIso}#US`, count: 3 }] };
      if (pk === 'QR#qr-b') return { Items: [{ pk, sk: `DC#${todayIso}#CA`, count: 5 }] };
    }
    return { Items: [] };
  });

  const { handler } = require('../../functions/analytics-summary');
  const res = await handler(authEvent({ userId: 'user-1' }));

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.scansLast30Days, 8);
  assert.equal(body.clicksLast30Days, 0);
  // byCountry merges per-QR rows: US=3, CA=5 → sorted desc by count.
  assert.deepEqual(body.byCountry, [
    { country: 'CA', count: 5 },
    { country: 'US', count: 3 },
  ]);
  const todayBucket = body.scansByDay.find((b) => b.bucket === todayIso);
  assert.ok(todayBucket, `expected a bucket for ${todayIso}`);
  assert.equal(todayBucket.count, 8);
});
