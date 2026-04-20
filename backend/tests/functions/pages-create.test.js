/**
 * Tests for backend/functions/pages-create.js
 *
 * Covers:
 *   - happy path: 201 with the new page payload (draft status, v1).
 *   - 409 when the slug is already taken (simulated via a
 *     TransactionCanceledException whose first cancellation reason is
 *     ConditionalCheckFailed — the same error shape
 *     reserveSlugAndPutPage emits on conflict).
 * CORS headers must be present on both.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');

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

function txCanceled(reasons) {
  const err = new Error('Transaction cancelled');
  err.name = 'TransactionCanceledException';
  err.CancellationReasons = reasons;
  return err;
}

test('pages-create happy path returns 201', async () => {
  preloadStubs({ ids: { newPageId: () => 'pagefix001' } });
  ddbMock.on(TransactWriteCommand).resolves({});

  const { handler } = require('../../functions/pages-create');

  const res = await handler(authEvent({
    userId: 'user-1',
    body: { slug: 'my-slug', displayName: 'Me' },
  }));

  assert.equal(res.statusCode, 201);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.pageId, 'pagefix001');
  assert.equal(body.slug, 'my-slug');
  assert.equal(body.status, 'draft');
  assert.equal(body.currentVersion, 1);
});

test('pages-create returns 409 when slug is already taken', async () => {
  preloadStubs({ ids: { newPageId: () => 'pagefix002' } });
  // ConditionalCheckFailed on the slug Put (index 0 for a fresh create).
  ddbMock
    .on(TransactWriteCommand)
    .rejects(txCanceled([{ Code: 'ConditionalCheckFailed' }]));

  const { handler } = require('../../functions/pages-create');

  const res = await handler(authEvent({
    userId: 'user-1',
    body: { slug: 'taken-slug', displayName: 'Me' },
  }));

  assert.equal(res.statusCode, 409);
  assertCors(res);
  assert.match(res.body, /slug already taken/i);
});
