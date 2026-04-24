const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { respond } = require('./shared/cors');
const { listUserQrs } = require('./shared/repo/appTable');

const s3 = new S3Client({});
const PRESIGN_TTL_SECONDS = 3600;

async function presignKey(bucket, key) {
  if (!key) return null;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGN_TTL_SECONDS,
  });
}

/**
 * GET /qrs — list the caller's QR codes. Soft-deleted items (enabled=false with
 * deletedAt) are excluded unless ?includeDeleted=true is passed.
 *
 * @returns {Promise<{ statusCode: number, headers: object, body: string }>}
 */
exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const includeDeleted = event.queryStringParameters?.includeDeleted === 'true';
  const bucket = process.env.STORAGE_BUCKET_NAME;

  try {
    const items = await listUserQrs(userId, 100);
    const filtered = includeDeleted ? items : items.filter((it) => !it.deletedAt);

    const withUrls = await Promise.all(filtered.map(async (item) => {
      const [qrCodeUrl, logoUrl] = await Promise.all([
        presignKey(bucket, item.qrCodeKey),
        presignKey(bucket, item.logoKey),
      ]);
      return {
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
      };
    }));

    return respond(200, { items: withUrls });
  } catch (err) {
    console.error('qrs-list error:', err);
    return respond(500, { error: 'Failed to list QR codes' });
  }
};
