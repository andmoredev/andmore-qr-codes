/**
 * Shared helper for building a `PublicPage`-shaped payload from a stored
 * page item. Used by both:
 *   - `public-page-get.js` (unauthenticated, only serves `status === 'published'`)
 *   - `pages-preview.js`   (authenticated owner-scoped draft preview)
 *
 * Keeping the serialization here guarantees the draft preview and the
 * published view are pixel-identical — they render from the same payload
 * via the SPA's `<PublicPageView>` component.
 *
 * @typedef {import('./types').PublicPage} PublicPage
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});

const AVATAR_URL_TTL_SECONDS = 3600;

const buildClickHref = (slug, linkKey) =>
  `/l/${Buffer.from(`${slug}:${linkKey}`).toString('base64url')}`;

/**
 * Build the `PublicPage` payload shape from a stored page item.
 *
 * @param {object} page  Raw page item from AppTable (contains pk/sk, links, avatarKey, etc.)
 * @returns {Promise<PublicPage>}
 */
async function buildPublicPagePayload(page) {
  const bucket = process.env.STORAGE_BUCKET_NAME;

  const avatarUrl = page.avatarKey && bucket
    ? await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: page.avatarKey }),
        { expiresIn: AVATAR_URL_TTL_SECONDS }
      )
    : null;

  const links = Array.isArray(page.links) ? [...page.links] : [];
  links.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return {
    slug: page.slug,
    displayName: page.displayName,
    bio: page.bio ?? '',
    avatarUrl,
    theme: page.theme,
    accentColor: page.accentColor,
    links: links.map((link) => ({
      linkKey: link.linkKey,
      kind: link.kind,
      label: link.label,
      icon: link.icon ?? null,
      clickHref: buildClickHref(page.slug, link.linkKey),
    })),
  };
}

module.exports = { buildPublicPagePayload, buildClickHref, AVATAR_URL_TTL_SECONDS };
