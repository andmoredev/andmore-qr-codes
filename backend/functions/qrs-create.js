const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { respond } = require('./shared/cors');
const { newQrId } = require('./shared/ids');
const { keys } = require('./shared/repo/appTable');
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
 * POST /qrs — create a direct or page-backed QR. Every QR encodes the canonical
 * scan URL `https://${PUBLIC_BASE_URL}/r/{qrId}` so every scan routes through
 * the public redirect Lambda for analytics.
 */
exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { name, type, destinationUrl, pageId, logoBase64, style = 'square' } = body;

  const validStyles = ['square', 'rounded', 'dots'];
  if (!validStyles.includes(style)) {
    return respond(400, { error: '"style" must be one of: square, rounded, dots' });
  }

  if (!name || typeof name !== 'string') {
    return respond(400, { error: '"name" is required' });
  }
  if (type !== 'direct' && type !== 'page') {
    return respond(400, { error: '"type" must be "direct" or "page"' });
  }
  if (type === 'direct' && !isValidUrl(destinationUrl)) {
    return respond(400, { error: '"destinationUrl" must be a valid http(s) URL for type=direct' });
  }
  if (type === 'page' && (typeof pageId !== 'string' || !pageId)) {
    return respond(400, { error: '"pageId" is required for type=page' });
  }

  const publicBase = process.env.PUBLIC_BASE_URL;
  if (!publicBase) {
    console.error('PUBLIC_BASE_URL is not configured');
    return respond(500, { error: 'Server misconfigured' });
  }

  const bucket = process.env.STORAGE_BUCKET_NAME;
  const qrId = newQrId();
  const version = 1;
  const padded = paddedVersion(version);
  const scanUrl = `${publicBase.replace(/\/$/, '')}/r/${qrId}`;
  const now = new Date().toISOString();

  try {
    let logoBuffer;
    if (logoBase64) {
      try {
        logoBuffer = Buffer.from(logoBase64, 'base64');
      } catch {
        return respond(400, { error: 'Invalid base64 logo data' });
      }
    }

    let pngBuffer;
    try {
      pngBuffer = await renderQrPng({ url: scanUrl, logoBuffer, style });
    } catch (err) {
      if (err instanceof QrRenderValidationError) {
        return respond(400, { error: err.message });
      }
      throw err;
    }

    const qrCodeKey = `qrcodes/${userId}/${qrId}/v${padded}.png`;
    const logoKey = logoBuffer ? `logos/${userId}/${qrId}/v${padded}.png` : undefined;

    const uploads = [
      s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: qrCodeKey,
        Body: pngBuffer,
        ContentType: 'image/png',
      })),
    ];
    if (logoBuffer) {
      uploads.push(s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: logoKey,
        Body: logoBuffer,
        ContentType: 'image/png',
      })));
    }
    await Promise.all(uploads);

    const qrItem = {
      ...keys.userQr(userId, qrId),
      qrId,
      userId,
      name,
      type,
      style,
      ...(type === 'direct' && { destinationUrl }),
      ...(type === 'page' && { pageId }),
      qrCodeKey,
      ...(logoKey && { logoKey }),
      enabled: true,
      currentVersion: version,
      createdAt: now,
      updatedAt: now,
    };

    const lookupItem = {
      ...keys.qrLookup(qrId),
      qrId,
      userId,
      type,
      ...(type === 'direct' && { destinationUrl }),
      ...(type === 'page' && { pageId }),
      enabled: true,
      currentVersion: version,
      updatedAt: now,
    };

    const versionItem = {
      ...keys.qrVersion(qrId, version),
      qrId,
      version,
      versionedAt: now,
      name,
      type,
      style,
      ...(type === 'direct' && { destinationUrl }),
      ...(type === 'page' && { pageId }),
      qrCodeKey,
      ...(logoKey && { logoKey }),
      enabled: true,
    };

    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: process.env.APP_TABLE_NAME, Item: qrItem } },
        { Put: { TableName: process.env.APP_TABLE_NAME, Item: lookupItem } },
        { Put: { TableName: process.env.APP_TABLE_NAME, Item: versionItem } },
      ],
    }));

    const [qrCodeUrl, logoUrl] = await Promise.all([
      presignKey(bucket, qrCodeKey),
      presignKey(bucket, logoKey),
    ]);

    return respond(201, {
      qrId,
      userId,
      name,
      type,
      style,
      destinationUrl: destinationUrl ?? null,
      pageId: pageId ?? null,
      qrCodeUrl,
      logoUrl,
      enabled: true,
      currentVersion: version,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    console.error('qrs-create error:', err);
    return respond(500, { error: 'Failed to create QR code' });
  }
};
