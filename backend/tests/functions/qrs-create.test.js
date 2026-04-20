/**
 * Tests for backend/functions/qrs-create.js
 *
 * Covers:
 *   - happy path: 201 for a valid `direct` QR
 *   - 400 for an invalid JSON body
 *   - 400 when `destinationUrl` is missing on a `direct`-type QR
 * Every response must carry CORS headers.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBDocumentClient, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');

const { assertCors, authEvent, setEnv, restoreEnv } = require('../helpers');
const { preloadStubs, resetStubs } = require('../stubs');

const s3Mock = mockClient(S3Client);
const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  s3Mock.reset();
  ddbMock.reset();
  setEnv({
    APP_TABLE_NAME: 'AppTable',
    STORAGE_BUCKET_NAME: 'bucket',
    PUBLIC_BASE_URL: 'https://qr.example.com',
  });
});

afterEach(() => {
  resetStubs();
  restoreEnv();
});

test('qrs-create happy path returns 201 with CORS and a persisted direct QR', async () => {
  preloadStubs({ ids: { newQrId: () => 'qrfixed123' } });
  s3Mock.on(PutObjectCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});
  const { handler } = require('../../functions/qrs-create');

  const event = authEvent({
    userId: 'user-1',
    body: { name: 'My QR', type: 'direct', destinationUrl: 'https://example.com' },
  });

  const res = await handler(event);

  assert.equal(res.statusCode, 201);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.qrId, 'qrfixed123');
  assert.equal(body.userId, 'user-1');
  assert.equal(body.name, 'My QR');
  assert.equal(body.type, 'direct');
  assert.equal(body.destinationUrl, 'https://example.com');
  assert.equal(body.enabled, true);
  assert.equal(body.currentVersion, 1);
  assert.ok(body.qrCodeUrl && body.qrCodeUrl.startsWith('https://signed.example/'));

  // Verify that the transaction contained three Puts (qr, lookup, version).
  const txCalls = ddbMock.commandCalls(TransactWriteCommand);
  assert.equal(txCalls.length, 1);
  assert.equal(txCalls[0].args[0].input.TransactItems.length, 3);
});

test('qrs-create returns 400 with CORS on invalid JSON body', async () => {
  preloadStubs();
  const { handler } = require('../../functions/qrs-create');

  const res = await handler({
    requestContext: { authorizer: { claims: { sub: 'user-1' } } },
    body: '{not-json',
    pathParameters: null,
  });

  assert.equal(res.statusCode, 400);
  assertCors(res);
  assert.match(res.body, /Invalid JSON/i);
});

test('qrs-create returns 400 when destinationUrl is missing on direct QR', async () => {
  preloadStubs();
  const { handler } = require('../../functions/qrs-create');

  const res = await handler(authEvent({
    body: { name: 'No URL', type: 'direct' },
  }));

  assert.equal(res.statusCode, 400);
  assertCors(res);
  assert.match(res.body, /destinationUrl/);
});
