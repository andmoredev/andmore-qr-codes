/**
 * Tests for backend/functions/redirect-link.js
 *
 * Covers GET /l/{clickId}:
 *   - happy path: 302 to the link URL, with a click event persisted when
 *     ?src=<qrId> is supplied.
 *   - malformed (non-decodeable) clickId → 302 to /p/unavailable. Never 4xx,
 *     because CloudFront's distribution-level CustomErrorResponses rewrite
 *     any 4xx from any origin to /index.html → SPA → /login.
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
  });
  resetStubs();
});

afterEach(() => {
  resetStubs();
  restoreEnv();
});

function encodeClickId(slug, linkKey) {
  return Buffer.from(`${slug}:${linkKey}`).toString('base64url');
}

test('redirect-link happy path 302s to link URL and writes click event when src= is supplied', async () => {
  // getPageBySlug = getByKey(slug) then getByKey(userPage).
  ddbMock
    .on(GetCommand, { Key: { pk: 'SLUG#me', sk: 'META' } })
    .resolves({ Item: { slug: 'me', pageId: 'page-1', userId: 'user-1' } })
    .on(GetCommand, { Key: { pk: 'USER#user-1', sk: 'PAGE#page-1' } })
    .resolves({
      Item: {
        slug: 'me',
        userId: 'user-1',
        pageId: 'page-1',
        links: [
          { linkKey: 'lk-abc', kind: 'custom', label: 'Blog', url: 'https://blog.example/' },
        ],
      },
    });
  ddbMock.on(PutCommand).resolves({});

  const { handler } = require('../../functions/redirect-link');

  const res = await handler(publicEvent({
    pathParameters: { clickId: encodeClickId('me', 'lk-abc') },
    queryStringParameters: { src: 'qr-origin' },
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }));

  assert.equal(res.statusCode, 302);
  assertCors(res);
  assert.equal(res.headers.Location, 'https://blog.example/');

  // Exactly one click event persisted.
  const puts = ddbMock.commandCalls(PutCommand);
  assert.equal(puts.length, 1);
  const item = puts[0].args[0].input.Item;
  assert.equal(item.qrId, 'qr-origin');
  assert.equal(item.linkKey, 'lk-abc');
});

test('redirect-link 302s to /p/unavailable for a malformed clickId', async () => {
  const { handler } = require('../../functions/redirect-link');

  const res = await handler(publicEvent({
    // Base64url-valid but missing the `:` separator → decode returns null.
    pathParameters: { clickId: 'bWFsZm9ybWVk' /* base64url("malformed") */ },
  }));

  assert.equal(res.statusCode, 302);
  assertCors(res);
  assert.equal(res.headers.Location, '/p/unavailable');
});
