/**
 * Tests for backend/functions/qrs-versions-restore.js
 *
 * Covers:
 *   - happy path: restoring a prior version returns 200 and copies the prior
 *     asset keys forward into a new version slot.
 *   - 404 when the requested version does not exist.
 * Every response carries CORS headers.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, CopyObjectCommand } = require('@aws-sdk/client-s3');
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
  setEnv({ APP_TABLE_NAME: 'AppTable', STORAGE_BUCKET_NAME: 'bucket' });
});

afterEach(() => {
  resetStubs();
  restoreEnv();
});

test('qrs-versions-restore happy path returns 200 and writes a new version', async () => {
  preloadStubs();

  // First GetCommand: getQrByUser; second: the version row.
  ddbMock
    .on(GetCommand, { Key: { pk: 'USER#user-1', sk: 'QR#qr-1' } })
    .resolves({
      Item: {
        pk: 'USER#user-1',
        sk: 'QR#qr-1',
        qrId: 'qr-1',
        userId: 'user-1',
        name: 'Current Name',
        type: 'direct',
        destinationUrl: 'https://current.example/',
        qrCodeKey: 'qrcodes/user-1/qr-1/v000003.png',
        enabled: true,
        currentVersion: 3,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
    })
    .on(GetCommand, { Key: { pk: 'QR#qr-1', sk: 'V#000001' } })
    .resolves({
      Item: {
        pk: 'QR#qr-1',
        sk: 'V#000001',
        qrId: 'qr-1',
        version: 1,
        name: 'Original',
        type: 'direct',
        destinationUrl: 'https://original.example/',
        qrCodeKey: 'qrcodes/user-1/qr-1/v000001.png',
        enabled: true,
      },
    });

  s3Mock.on(CopyObjectCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  const { handler } = require('../../functions/qrs-versions-restore');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { qrId: 'qr-1', n: '1' },
  }));

  assert.equal(res.statusCode, 200);
  assertCors(res);
  const body = JSON.parse(res.body);
  assert.equal(body.restoredFrom, 1);
  assert.equal(body.currentVersion, 4);
  assert.equal(body.name, 'Original');
  assert.equal(body.destinationUrl, 'https://original.example/');

  // CopyObject must have been called for the QR PNG pointing at the new slot.
  const copies = s3Mock.commandCalls(CopyObjectCommand);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].args[0].input.Key, 'qrcodes/user-1/qr-1/v000004.png');
});

test('qrs-versions-restore returns 404 when version does not exist', async () => {
  preloadStubs();

  ddbMock
    .on(GetCommand, { Key: { pk: 'USER#user-1', sk: 'QR#qr-1' } })
    .resolves({
      Item: {
        qrId: 'qr-1',
        userId: 'user-1',
        type: 'direct',
        destinationUrl: 'https://x.example/',
        qrCodeKey: 'qrcodes/user-1/qr-1/v000001.png',
        enabled: true,
        currentVersion: 1,
        name: 'x',
      },
    })
    .on(GetCommand, { Key: { pk: 'QR#qr-1', sk: 'V#000099' } })
    .resolves({});

  const { handler } = require('../../functions/qrs-versions-restore');

  const res = await handler(authEvent({
    userId: 'user-1',
    pathParameters: { qrId: 'qr-1', n: '99' },
  }));

  assert.equal(res.statusCode, 404);
  assertCors(res);
  assert.match(res.body, /Version 99 not found/);
});
