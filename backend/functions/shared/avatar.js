/**
 * Avatar upload helper. Decodes a base64 string and stores it in
 * StorageBucket at `avatars/{userId}/{pageId}/v{n}.png`. The caller
 * records the returned key on the page item.
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({});

/**
 * @param {{ userId: string, pageId: string, version: number, base64: string }} args
 * @returns {Promise<string>} the S3 object key
 */
async function uploadAvatar({ userId, pageId, version, base64 }) {
  const bucket = process.env.STORAGE_BUCKET_NAME;
  // Strip optional `data:image/...;base64,` prefix.
  const raw = typeof base64 === 'string' && base64.includes(',')
    ? base64.slice(base64.indexOf(',') + 1)
    : base64;
  const body = Buffer.from(raw, 'base64');
  const key = `avatars/${userId}/${pageId}/v${version}.png`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'image/png',
  }));
  return key;
}

module.exports = { uploadAvatar };
