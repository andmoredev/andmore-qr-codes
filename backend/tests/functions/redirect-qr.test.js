/**
 * Tests for backend/functions/redirect-qr.js
 *
 * Covers all branches of GET /r/{qrId}:
 *   - direct-type QR → 302 to destinationUrl
 *   - page-type + published → 302 to /p/{slug}?src=<qrId>
 *   - page-type + unpublished (draft) → 302 to /p/unavailable
 *   - missing or disabled QR → 404
 * Scan events fire via putScanEvent in the happy paths but must never break the
 * redirect if the events table is unreachable.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} = require('@aws-sdk/lib-dynamodb');

const { assertCors, publicEvent, setEnv, restoreEnv } = require('../helpers');
const { resetStubs } = require('../stubs');

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  setEnv({
    APP_TABLE_NAME: 'AppTable',
    EVENTS_TABLE_NAME: 'EventsTable',
    PUBLIC_BASE_URL: 'https://qr.example.com',
  });
  // Reset the module cache so env changes are picked up on each require().
  resetStubs();
});

afterEach(() => {
  resetStubs();
  restoreEnv();
});

test('redirect-qr direct type 302s to destinationUrl with CORS headers', async () => {
  ddbMock
    .on(GetCommand)
    .resolves({
      Item: {
        qrId: 'qr-1',
        type: 'direct',
        destinationUrl: 'https://go.example/',
        enabled: true,
      },
    });
  ddbMock.on(PutCommand).resolves({});

  const { handler } = require('../../functions/redirect-qr');

  const res = await handler(publicEvent({
    pathParameters: { qrId: 'qr-1' },
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }));

  assert.equal(res.statusCode, 302);
  assertCors(res);
  assert.equal(res.headers.Location, 'https://go.example/');

  // Scan event persisted with an expiresAt driving the EventsTable TTL.
  const puts = ddbMock.commandCalls(PutCommand);
  assert.equal(puts.length, 1);
  const item = puts[0].args[0].input.Item;
  assert.equal(item.qrId, 'qr-1');
  const { EVENT_TTL_SECONDS } = require('../../functions/shared/repo/eventsTable');
  const expectedExpiresAt = Math.floor(Date.now() / 1000) + EVENT_TTL_SECONDS;
  assert.equal(typeof item.expiresAt, 'number');
  assert.ok(item.expiresAt > 0, 'expiresAt must be a positive epoch-seconds value');
  assert.ok(
    Math.abs(item.expiresAt - expectedExpiresAt) <= 60,
    `expiresAt ${item.expiresAt} should be within 60s of ${expectedExpiresAt}`,
  );
});

test('redirect-qr page type + published 302s to /p/{slug}?src=<qrId>', async () => {
  // First GetCommand resolves the QR lookup; second resolves the page item.
  ddbMock
    .on(GetCommand, { Key: { pk: 'QR#qr-2', sk: 'META' } })
    .resolves({
      Item: {
        qrId: 'qr-2',
        type: 'page',
        userId: 'user-1',
        pageId: 'page-1',
        enabled: true,
      },
    })
    .on(GetCommand, { Key: { pk: 'USER#user-1', sk: 'PAGE#page-1' } })
    .resolves({
      Item: {
        pageId: 'page-1',
        userId: 'user-1',
        slug: 'me',
        status: 'published',
      },
    });
  ddbMock.on(PutCommand).resolves({});

  const { handler } = require('../../functions/redirect-qr');

  const res = await handler(publicEvent({
    pathParameters: { qrId: 'qr-2' },
  }));

  assert.equal(res.statusCode, 302);
  assertCors(res);
  assert.equal(res.headers.Location, 'https://qr.example.com/p/me?src=qr-2');
});

test('redirect-qr page type + unpublished 302s to /p/unavailable', async () => {
  ddbMock
    .on(GetCommand, { Key: { pk: 'QR#qr-3', sk: 'META' } })
    .resolves({
      Item: {
        qrId: 'qr-3',
        type: 'page',
        userId: 'user-1',
        pageId: 'page-draft',
        enabled: true,
      },
    })
    .on(GetCommand, { Key: { pk: 'USER#user-1', sk: 'PAGE#page-draft' } })
    .resolves({
      Item: {
        pageId: 'page-draft',
        userId: 'user-1',
        slug: 'draft-slug',
        status: 'draft',
      },
    });
  ddbMock.on(PutCommand).resolves({});

  const { handler } = require('../../functions/redirect-qr');

  const res = await handler(publicEvent({
    pathParameters: { qrId: 'qr-3' },
  }));

  assert.equal(res.statusCode, 302);
  assertCors(res);
  assert.equal(res.headers.Location, 'https://qr.example.com/p/unavailable');
});

test('redirect-qr returns 404 with CORS for unknown or disabled QR', async () => {
  ddbMock.on(GetCommand).resolves({ Item: { qrId: 'qr-4', enabled: false } });

  const { handler } = require('../../functions/redirect-qr');

  const res = await handler(publicEvent({
    pathParameters: { qrId: 'qr-4' },
  }));

  assert.equal(res.statusCode, 404);
  assertCors(res);
});
