const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { respond } = require('./shared/cors');
const { getQrByUser, keys } = require('./shared/repo/appTable');
const { renderQrPng, QrRenderValidationError } = require('./shared/qrRender');

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

function isValidUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * PATCH /qrs/{qrId} — partial update that snapshots the previous state as a
 * new version and bumps `currentVersion`. A new QR PNG (and optional logo) is
 * always re-rendered into fresh `v{n}.png` keys; uploads happen before the
 * transaction so failed writes leave orphaned objects rather than torn state.
 */
exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const qrId = event.pathParameters?.qrId;
  if (!qrId) return respond(400, { error: '"qrId" path parameter is required' });

  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const publicBase = process.env.PUBLIC_BASE_URL;
  if (!publicBase) {
    console.error('PUBLIC_BASE_URL is not configured');
    return respond(500, { error: 'Server misconfigured' });
  }

  const bucket = process.env.STORAGE_BUCKET_NAME;

  try {
    const existing = await getQrByUser(userId, qrId);
    if (!existing) return respond(404, { error: 'QR code not found' });

    const {
      name, destinationUrl, pageId, logoBase64, enabled, style,
    } = body;

    const validStyles = ['square', 'rounded', 'dots'];
    if (style !== undefined && !validStyles.includes(style)) {
      return respond(400, { error: '"style" must be one of: square, rounded, dots' });
    }

    // Validate any provided fields without changing type.
    if (name !== undefined && (typeof name !== 'string' || !name)) {
      return respond(400, { error: '"name" must be a non-empty string' });
    }
    if (destinationUrl !== undefined && existing.type !== 'direct') {
      return respond(400, { error: 'destinationUrl can only be set on direct-type QRs' });
    }
    if (destinationUrl !== undefined && !isValidUrl(destinationUrl)) {
      return respond(400, { error: '"destinationUrl" must be a valid http(s) URL' });
    }
    if (pageId !== undefined && existing.type !== 'page') {
      return respond(400, { error: 'pageId can only be set on page-type QRs' });
    }
    if (pageId !== undefined && (typeof pageId !== 'string' || !pageId)) {
      return respond(400, { error: '"pageId" must be a non-empty string' });
    }
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return respond(400, { error: '"enabled" must be a boolean' });
    }

    const newVersion = (existing.currentVersion ?? 1) + 1;
    const padded = paddedVersion(newVersion);
    const scanUrl = `${publicBase.replace(/\/$/, '')}/r/${qrId}`;
    const now = new Date().toISOString();

    // Resolve new logo buffer: an explicit null clears the logo, absence keeps prior.
    let logoBuffer;
    let logoAction = 'keep'; // 'keep' | 'replace' | 'clear'
    if (logoBase64 === null) {
      logoAction = 'clear';
    } else if (typeof logoBase64 === 'string' && logoBase64.length > 0) {
      logoAction = 'replace';
      try {
        logoBuffer = Buffer.from(logoBase64, 'base64');
      } catch {
        return respond(400, { error: 'Invalid base64 logo data' });
      }
    } else if (existing.logoKey) {
      // Need the prior logo bytes to re-render the new PNG with the same logo.
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: existing.logoKey }));
      logoBuffer = Buffer.from(await res.Body.transformToByteArray());
    }

    let pngBuffer;
    try {
      pngBuffer = await renderQrPng({ url: scanUrl, logoBuffer, style: style ?? existing.style ?? 'square' });
    } catch (err) {
      if (err instanceof QrRenderValidationError) {
        return respond(400, { error: err.message });
      }
      throw err;
    }

    const newQrCodeKey = `qrcodes/${userId}/${qrId}/v${padded}.png`;
    const newLogoKey = (logoAction === 'replace' || (logoAction === 'keep' && existing.logoKey))
      ? `logos/${userId}/${qrId}/v${padded}.png`
      : undefined;

    const uploads = [
      s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: newQrCodeKey,
        Body: pngBuffer,
        ContentType: 'image/png',
      })),
    ];
    if (newLogoKey && logoBuffer) {
      uploads.push(s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: newLogoKey,
        Body: logoBuffer,
        ContentType: 'image/png',
      })));
    }
    await Promise.all(uploads);

    const resolvedStyle = style ?? existing.style ?? 'square';

    // Snapshot the PRIOR state at V#{newVersion} so version history shows the
    // state just before this change alongside the new currentVersion pointer.
    const snapshotItem = {
      ...keys.qrVersion(qrId, newVersion),
      qrId,
      version: newVersion,
      versionedAt: now,
      // prior state (pre-change):
      priorName: existing.name,
      priorType: existing.type,
      ...(existing.destinationUrl !== undefined && { priorDestinationUrl: existing.destinationUrl }),
      ...(existing.pageId !== undefined && { priorPageId: existing.pageId }),
      priorQrCodeKey: existing.qrCodeKey,
      ...(existing.logoKey && { priorLogoKey: existing.logoKey }),
      priorEnabled: existing.enabled,
      priorVersion: existing.currentVersion ?? 1,
      // new state (post-change) stored for restore convenience:
      name: name ?? existing.name,
      type: existing.type,
      style: resolvedStyle,
      ...(existing.type === 'direct' && {
        destinationUrl: destinationUrl !== undefined ? destinationUrl : existing.destinationUrl,
      }),
      ...(existing.type === 'page' && {
        pageId: pageId !== undefined ? pageId : existing.pageId,
      }),
      qrCodeKey: newQrCodeKey,
      ...(newLogoKey && { logoKey: newLogoKey }),
      enabled: enabled !== undefined ? enabled : existing.enabled,
    };

    const updatedItem = {
      ...keys.userQr(userId, qrId),
      qrId,
      userId,
      name: name ?? existing.name,
      type: existing.type,
      style: resolvedStyle,
      ...(existing.type === 'direct' && {
        destinationUrl: destinationUrl !== undefined ? destinationUrl : existing.destinationUrl,
      }),
      ...(existing.type === 'page' && {
        pageId: pageId !== undefined ? pageId : existing.pageId,
      }),
      qrCodeKey: newQrCodeKey,
      ...(newLogoKey && { logoKey: newLogoKey }),
      enabled: enabled !== undefined ? enabled : existing.enabled,
      currentVersion: newVersion,
      createdAt: existing.createdAt,
      updatedAt: now,
      ...(existing.deletedAt && enabled !== true && { deletedAt: existing.deletedAt }),
    };

    const lookupItem = {
      ...keys.qrLookup(qrId),
      qrId,
      userId,
      type: existing.type,
      ...(existing.type === 'direct' && {
        destinationUrl: destinationUrl !== undefined ? destinationUrl : existing.destinationUrl,
      }),
      ...(existing.type === 'page' && {
        pageId: pageId !== undefined ? pageId : existing.pageId,
      }),
      enabled: enabled !== undefined ? enabled : existing.enabled,
      currentVersion: newVersion,
      updatedAt: now,
    };

    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: process.env.APP_TABLE_NAME, Item: updatedItem } },
        { Put: { TableName: process.env.APP_TABLE_NAME, Item: lookupItem } },
        { Put: { TableName: process.env.APP_TABLE_NAME, Item: snapshotItem } },
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
      style: updatedItem.style,
      destinationUrl: updatedItem.destinationUrl ?? null,
      pageId: updatedItem.pageId ?? null,
      qrCodeUrl,
      logoUrl,
      enabled: updatedItem.enabled,
      currentVersion: updatedItem.currentVersion,
      createdAt: updatedItem.createdAt,
      updatedAt: updatedItem.updatedAt,
    });
  } catch (err) {
    console.error('qrs-update error:', err);
    return respond(500, { error: 'Failed to update QR code' });
  }
};
