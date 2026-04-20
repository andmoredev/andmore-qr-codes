const { S3Client, CopyObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { respond } = require('./shared/cors');
const { getQrByUser, keys } = require('./shared/repo/appTable');

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const PRESIGN_TTL_SECONDS = 3600;

async function presignKey(bucket, key) {
  if (!key) return null;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGN_TTL_SECONDS,
  });
}

function paddedVersion(n) {
  return String(n).padStart(6, '0');
}

/**
 * POST /qrs/{qrId}/versions/{n}/restore — restore a prior version.
 *
 * The scan URL encoded in every QR PNG is `/r/{qrId}` regardless of the
 * destination; therefore restoring a version just copies that version's stored
 * S3 PNGs forward into a new `v{newVersion}.png` slot (no re-rendering needed)
 * and flips the main entity's fields back to match. The prior (pre-restore)
 * state is snapshotted into the new version row so history is never lost and
 * the restore itself is reversible.
 */
exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const qrId = event.pathParameters?.qrId;
  const nParam = event.pathParameters?.n;
  if (!qrId) return respond(400, { error: '"qrId" path parameter is required' });

  const n = Number.parseInt(nParam, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return respond(400, { error: '"n" must be a positive integer' });
  }

  const bucket = process.env.STORAGE_BUCKET_NAME;
  const table = process.env.APP_TABLE_NAME;

  try {
    const existing = await getQrByUser(userId, qrId);
    if (!existing) return respond(404, { error: 'QR code not found' });

    const versionRes = await dynamo.send(new GetCommand({
      TableName: table,
      Key: keys.qrVersion(qrId, n),
    }));
    const ver = versionRes.Item;
    if (!ver) return respond(404, { error: `Version ${n} not found` });

    const targetQrCodeKey = ver.qrCodeKey;
    const targetLogoKey = ver.logoKey ?? null;
    if (!targetQrCodeKey) {
      return respond(500, { error: 'Stored version is missing qrCodeKey' });
    }

    const newVersion = (existing.currentVersion ?? 1) + 1;
    const padded = paddedVersion(newVersion);
    const newQrCodeKey = `qrcodes/${userId}/${qrId}/v${padded}.png`;
    const newLogoKey = targetLogoKey ? `logos/${userId}/${qrId}/v${padded}.png` : null;
    const now = new Date().toISOString();

    // Copy version n's assets forward into the new version slot so the main
    // entity's qrCodeKey/logoKey always point at the current version number.
    const copies = [
      s3.send(new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `/${bucket}/${targetQrCodeKey}`,
        Key: newQrCodeKey,
      })),
    ];
    if (targetLogoKey && newLogoKey) {
      copies.push(s3.send(new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `/${bucket}/${targetLogoKey}`,
        Key: newLogoKey,
      })));
    }
    await Promise.all(copies);

    // Resolve restored fields. Prefer the version's "new state" block (written
    // by prior updates) and fall back to "prior*" fields from legacy rows.
    const restoredName = ver.name ?? ver.priorName ?? existing.name;
    const restoredType = ver.type ?? ver.priorType ?? existing.type;
    const restoredDestinationUrl = restoredType === 'direct'
      ? (ver.destinationUrl ?? ver.priorDestinationUrl ?? existing.destinationUrl)
      : undefined;
    const restoredPageId = restoredType === 'page'
      ? (ver.pageId ?? ver.priorPageId ?? existing.pageId)
      : undefined;

    // Restore always re-enables the QR, per spec.
    const snapshotItem = {
      ...keys.qrVersion(qrId, newVersion),
      qrId,
      version: newVersion,
      versionedAt: now,
      note: `restored from v${n}`,
      priorName: existing.name,
      priorType: existing.type,
      ...(existing.destinationUrl !== undefined && { priorDestinationUrl: existing.destinationUrl }),
      ...(existing.pageId !== undefined && { priorPageId: existing.pageId }),
      priorQrCodeKey: existing.qrCodeKey,
      ...(existing.logoKey && { priorLogoKey: existing.logoKey }),
      priorEnabled: existing.enabled,
      priorVersion: existing.currentVersion ?? 1,
      restoredFrom: n,
      name: restoredName,
      type: restoredType,
      ...(restoredDestinationUrl !== undefined && { destinationUrl: restoredDestinationUrl }),
      ...(restoredPageId !== undefined && { pageId: restoredPageId }),
      qrCodeKey: newQrCodeKey,
      ...(newLogoKey && { logoKey: newLogoKey }),
      enabled: true,
    };

    const updatedItem = {
      ...keys.userQr(userId, qrId),
      qrId,
      userId,
      name: restoredName,
      type: restoredType,
      ...(restoredDestinationUrl !== undefined && { destinationUrl: restoredDestinationUrl }),
      ...(restoredPageId !== undefined && { pageId: restoredPageId }),
      qrCodeKey: newQrCodeKey,
      ...(newLogoKey && { logoKey: newLogoKey }),
      enabled: true,
      currentVersion: newVersion,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    const lookupItem = {
      ...keys.qrLookup(qrId),
      qrId,
      userId,
      type: restoredType,
      ...(restoredDestinationUrl !== undefined && { destinationUrl: restoredDestinationUrl }),
      ...(restoredPageId !== undefined && { pageId: restoredPageId }),
      enabled: true,
      currentVersion: newVersion,
      updatedAt: now,
    };

    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: table, Item: updatedItem } },
        { Put: { TableName: table, Item: lookupItem } },
        { Put: { TableName: table, Item: snapshotItem } },
      ],
    }));

    const [qrCodeUrl, logoUrl] = await Promise.all([
      presignKey(bucket, updatedItem.qrCodeKey),
      presignKey(bucket, updatedItem.logoKey),
    ]);

    return respond(200, {
      qrId,
      userId,
      name: updatedItem.name,
      type: updatedItem.type,
      destinationUrl: updatedItem.destinationUrl ?? null,
      pageId: updatedItem.pageId ?? null,
      qrCodeUrl,
      logoUrl,
      enabled: updatedItem.enabled,
      currentVersion: updatedItem.currentVersion,
      createdAt: updatedItem.createdAt,
      updatedAt: updatedItem.updatedAt,
      restoredFrom: n,
    });
  } catch (err) {
    console.error('qrs-versions-restore error:', err);
    return respond(500, { error: 'Failed to restore version' });
  }
};
