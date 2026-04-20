/**
 * Tests for backend/functions/qrs-update.js
 *
 * Covers:
 *   - happy path: 200 + new version row written via TransactWrite
 *   - 404 when the target QR does not belong to the caller
 * Every response must carry CORS headers.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

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

test('qrs-update happy path returns 200 and bumps currentVersion', async () => {
  preloadStubs();

  ddbMock.on(GetCommand).resolves({
    Item: {
      pk: 'USER#user-1',
      sk: 'QR#qr-1',
      qrId: 'qr-1',
      userId: 'user-1',
      name: 'Old Name',
      type: 'direct',
      destinationUrl: 'https://old.example/',
      qrCodeKey: 'qrcodes/user-1/qr-1/v000001.png',
      enabled: true,
      currentVersion: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  });
  s3Mock.on(PutObjectCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  const { handler } = require('../../functions/qrs-update');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { qrId: 'qr-1' },
    body: { name: 'New Name' },
  }));

  assert.equal(res.statusCode, 200);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.name, 'New Name');
  assert.equal(body.currentVersion, 2);

  // Transaction must contain three Puts (updated, lookup, snapshot) and include
  // a version snapshot at V#000002.
  const tx = ddbMock.commandCalls(TransactWriteCommand);
  assert.equal(tx.length, 1);
  const items = tx[0].args[0].input.TransactItems;
  assert.equal(items.length, 3);
  const snapshot = items[2].Put.Item;
  assert.equal(snapshot.pk, 'QR#qr-1');
  assert.equal(snapshot.sk, 'V#000002');
  assert.equal(snapshot.priorName, 'Old Name');
  assert.equal(snapshot.name, 'New Name');
});

test('qrs-update returns 404 with CORS when QR is not owned by the caller', async () => {
  preloadStubs();
  ddbMock.on(GetCommand).resolves({});

  const { handler } = require('../../functions/qrs-update');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { qrId: 'qr-nope' },
    body: { name: 'x' },
  }));

  assert.equal(res.statusCode, 404);
  assertCors(res);
  assert.match(res.body, /not found/i);
});
