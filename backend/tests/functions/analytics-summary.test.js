/**
 * Tests for backend/functions/analytics-summary.js
 *
 * Covers GET /analytics/summary:
 *   - happy path: 200 with totals, recent items and a 31-day scansByDay bucket.
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
  setEnv({ APP_TABLE_NAME: 'AppTable', EVENTS_TABLE_NAME: 'EventsTable' });
  resetStubs();
});

afterEach(() => {
  resetStubs();
  restoreEnv();
});

test('analytics-summary happy path returns a DashboardSummary with recent and bucketed data', async () => {
  // First two Query calls from Promise.all([listUserQrs, listUserPages]) — we
  // can't easily route by ExpressionAttributeValues here without the exact
  // matcher, so use an in-order stack.
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
  // Subsequent Query calls are scans for each QR. listUserQrs returned 2 QRs
  // (both type=direct), so we expect exactly 2 queryScans calls and zero
  // queryClicks. Return an empty Items array for each.
  const emptyEvents = { Items: [] };

  let call = 0;
  ddbMock.on(QueryCommand).callsFake(() => {
    call += 1;
    if (call === 1) return qrQueryResult;
    if (call === 2) return pageQueryResult;
    return emptyEvents;
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
