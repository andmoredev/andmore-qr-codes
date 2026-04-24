const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { respond } = require('./shared/cors');
const { getQrByUser } = require('./shared/repo/appTable');

const s3 = new S3Client({});
const PRESIGN_TTL_SECONDS = 3600;

async function presignKey(bucket, key) {
  if (!key) return null;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGN_TTL_SECONDS,
  });
}

/** GET /qrs/{qrId} — fetch one QR owned by the caller. */
exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const qrId = event.pathParameters?.qrId;
  if (!qrId) return respond(400, { error: '"qrId" path parameter is required' });

  const bucket = process.env.STORAGE_BUCKET_NAME;

  try {
    const item = await getQrByUser(userId, qrId);
    if (!item) return respond(404, { error: 'QR code not found' });

    const [qrCodeUrl, logoUrl] = await Promise.all([
      presignKey(bucket, item.qrCodeKey),
      presignKey(bucket, item.logoKey),
    ]);

    return respond(200, {
      qrId: item.qrId,
      userId: item.userId,
      name: item.name,
      type: item.type,
      style: item.style ?? 'square',
      destinationUrl: item.destinationUrl ?? null,
      pageId: item.pageId ?? null,
      qrCodeUrl,
      logoUrl,
      enabled: item.enabled,
      currentVersion: item.currentVersion,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ...(item.deletedAt && { deletedAt: item.deletedAt }),
    });
  } catch (err) {
    console.error('qrs-get error:', err);
    return respond(500, { error: 'Failed to fetch QR code' });
  }
};
