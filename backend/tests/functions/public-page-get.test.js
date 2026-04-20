/**
 * Tests for backend/functions/public-page-get.js
 *
 * Covers GET /public/pages/{slug}:
 *   - happy path: 200 with a serialized PublicPage and `/l/{clickId}` hrefs.
 *   - 404 when the page is in draft (status !== 'published').
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const { assertCors, publicEvent, setEnv, restoreEnv } = require('../helpers');
const { preloadStubs, resetStubs } = require('../stubs');

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  setEnv({ APP_TABLE_NAME: 'AppTable', STORAGE_BUCKET_NAME: 'bucket' });
});

afterEach(() => {
  resetStubs();
  restoreEnv();
});

test('public-page-get returns 200 for a published page with base64url click hrefs', async () => {
  preloadStubs();
  ddbMock
    .on(GetCommand, { Key: { pk: 'SLUG#me', sk: 'META' } })
    .resolves({ Item: { slug: 'me', pageId: 'page-1', userId: 'user-1' } })
    .on(GetCommand, { Key: { pk: 'USER#user-1', sk: 'PAGE#page-1' } })
    .resolves({
      Item: {
        slug: 'me',
        pageId: 'page-1',
        userId: 'user-1',
        displayName: 'Me',
        bio: 'hello',
        theme: 'dark',
        accentColor: '#22C55E',
        status: 'published',
        links: [
          { linkKey: 'lk-blog', kind: 'blog', label: 'Blog', order: 0 },
          { linkKey: 'lk-gh', kind: 'github', label: 'GH', order: 1 },
        ],
      },
    });

  const { handler } = require('../../functions/public-page-get');

  const res = await handler(publicEvent({ pathParameters: { slug: 'me' } }));

  assert.equal(res.statusCode, 200);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.slug, 'me');
  assert.equal(body.displayName, 'Me');
  assert.equal(body.links.length, 2);
  const expectedClickHref = `/l/${Buffer.from('me:lk-blog').toString('base64url')}`;
  assert.equal(body.links[0].clickHref, expectedClickHref);
});

test('public-page-get returns 404 for a draft page', async () => {
  preloadStubs();
  ddbMock
    .on(GetCommand, { Key: { pk: 'SLUG#draft', sk: 'META' } })
    .resolves({ Item: { slug: 'draft', pageId: 'page-d', userId: 'user-1' } })
    .on(GetCommand, { Key: { pk: 'USER#user-1', sk: 'PAGE#page-d' } })
    .resolves({
      Item: {
        slug: 'draft',
        pageId: 'page-d',
        userId: 'user-1',
        status: 'draft',
        links: [],
      },
    });

  const { handler } = require('../../functions/public-page-get');

  const res = await handler(publicEvent({ pathParameters: { slug: 'draft' } }));

  assert.equal(res.statusCode, 404);
  assertCors(res);
});
