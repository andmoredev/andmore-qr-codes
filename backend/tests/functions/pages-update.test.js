/**
 * Tests for backend/functions/pages-update.js
 *
 * Covers:
 *   - happy path with no slug change: 200 and calls updatePageWithVersion
 *     (single transaction with two Puts).
 *   - slug change path: 200 and calls reserveSlugAndPutPage (transaction with
 *     a Delete of the previous slug reservation).
 *   - 409 on slug conflict: TransactionCanceledException with
 *     ConditionalCheckFailed on the slug Put item.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

const { assertCors, authEvent, setEnv, restoreEnv } = require('../helpers');
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

function currentPage(overrides = {}) {
  return {
    pk: 'USER#user-1',
    sk: 'PAGE#page-1',
    pageId: 'page-1',
    userId: 'user-1',
    slug: 'current-slug',
    displayName: 'Me',
    bio: '',
    theme: 'dark',
    accentColor: '#22C55E',
    links: [],
    status: 'draft',
    currentVersion: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('pages-update happy path with no slug change returns 200 and bumps version', async () => {
  preloadStubs();
  ddbMock.on(GetCommand).resolves({ Item: currentPage() });
  ddbMock.on(TransactWriteCommand).resolves({});

  const { handler } = require('../../functions/pages-update');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { pageId: 'page-1' },
    body: { displayName: 'Me 2.0' },
  }));

  assert.equal(res.statusCode, 200);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.displayName, 'Me 2.0');
  assert.equal(body.currentVersion, 2);
  assert.equal(body.slug, 'current-slug');

  // updatePageWithVersion → two Puts; no Delete item.
  const tx = ddbMock.commandCalls(TransactWriteCommand);
  assert.equal(tx.length, 1);
  const items = tx[0].args[0].input.TransactItems;
  assert.equal(items.length, 2);
  assert.ok(items[0].Put && items[1].Put, 'both items are Puts');
});

test('pages-update slug change goes through reserveSlugAndPutPage (Delete + Put + Put + Put)', async () => {
  preloadStubs();
  ddbMock.on(GetCommand).resolves({ Item: currentPage() });
  ddbMock.on(TransactWriteCommand).resolves({});

  const { handler } = require('../../functions/pages-update');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { pageId: 'page-1' },
    body: { slug: 'new-slug' },
  }));

  assert.equal(res.statusCode, 200);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.slug, 'new-slug');

  // reserveSlugAndPutPage with previousSlug produces: Delete, Put(slug), Put(page), Put(version)
  const tx = ddbMock.commandCalls(TransactWriteCommand);
  assert.equal(tx.length, 1);
  const items = tx[0].args[0].input.TransactItems;
  assert.equal(items.length, 4);
  assert.ok(items[0].Delete, 'first op must be a Delete on the old slug');
  assert.equal(items[0].Delete.Key.pk, 'SLUG#current-slug');
  assert.ok(items[1].Put && items[1].Put.Item.pk === 'SLUG#new-slug', 'second op is the new slug Put');
});

test('pages-update returns 409 when slug change conflicts with existing slug', async () => {
  preloadStubs();
  ddbMock.on(GetCommand).resolves({ Item: currentPage() });

  const err = new Error('tx cancelled');
  err.name = 'TransactionCanceledException';
  // Delete ok (None) + slug Put fails with ConditionalCheckFailed at index 1.
  err.CancellationReasons = [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }];
  ddbMock.on(TransactWriteCommand).rejects(err);

  const { handler } = require('../../functions/pages-update');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { pageId: 'page-1' },
    body: { slug: 'someone-elses-slug' },
  }));

  assert.equal(res.statusCode, 409);
  assertCors(res);
  assert.match(res.body, /slug already taken/i);
});
