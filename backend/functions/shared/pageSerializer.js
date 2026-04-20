/**
 * Shared helpers for serializing LinkPage items in API responses and
 * building version-snapshot items.
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});

const AVATAR_URL_TTL_SECONDS = 3600;

/**
 * Internal DynamoDB fields that must not leak into API responses.
 */
const INTERNAL_FIELDS = new Set(['pk', 'sk']);

/**
 * Strip DynamoDB-internal fields from a page item and attach a fresh
 * presigned avatar URL if an `avatarKey` is present.
 *
 * @param {object} pageItem
 */
async function serializePage(pageItem) {
  if (!pageItem) return null;
  const bucket = process.env.STORAGE_BUCKET_NAME;
  const out = {};
  for (const [k, v] of Object.entries(pageItem)) {
    if (!INTERNAL_FIELDS.has(k)) out[k] = v;
  }
  if (pageItem.avatarKey && bucket) {
    try {
      out.avatarUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: pageItem.avatarKey }),
        { expiresIn: AVATAR_URL_TTL_SECONDS },
      );
    } catch (err) {
      // Presigning should not block the response — emit without a URL.
      console.warn('Failed to presign avatar URL', err);
    }
  }
  return out;
}

/**
 * Build the immutable version-snapshot item written alongside a page update.
 * The snapshot captures the exact page state at version `n` (pre-increment).
 *
 * @param {object} pageItem  page record at version n (with pk/sk already present or not)
 * @param {number} n         the version number stored in the snapshot
 * @param {string} [note]
 */
function buildVersionItem(pageItem, n, note) {
  const pageId = pageItem.pageId;
  const versionedAt = new Date().toISOString();
  const item = {
    pk: `PAGE#${pageId}`,
    sk: `V#${String(n).padStart(6, '0')}`,
    pageId,
    userId: pageItem.userId,
    version: n,
    versionedAt,
  };
  if (note) item.note = note;
  // Copy the snapshot fields — avoid stomping pk/sk above.
  for (const [k, v] of Object.entries(pageItem)) {
    if (k === 'pk' || k === 'sk') continue;
    if (k === 'pageId' || k === 'userId') continue;
    item[k] = v;
  }
  return item;
}

module.exports = { serializePage, buildVersionItem, AVATAR_URL_TTL_SECONDS };
