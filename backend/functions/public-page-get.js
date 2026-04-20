/**
 * GET /public/pages/{slug} — unauthenticated public page payload for SPA rendering.
 *
 * Fetches the slug reservation + page item via getPageBySlug (two GetItems:
 * SLUG#{slug}/META then USER#{userId}/PAGE#{pageId}), presigns the avatar if
 * present, and returns a PublicPage-shaped payload with deterministic
 * `/l/{clickId}` click hrefs for every link.
 *
 * Notes:
 * - `clickId` is a base64url-encoded `${slug}:${linkKey}` so the /l/{clickId}
 *   handler (workstream A) can resolve the destination without a DB join. The
 *   SPA is responsible for appending any `?src=` it observed from the current
 *   URL before navigating.
 * - Draft pages (status !== 'published') return 404.
 *
 * @typedef {import('./shared/types').PublicPage} PublicPage
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { respond } = require('./shared/cors');
const { getPageBySlug } = require('./shared/repo/appTable');
const { AVATAR_URL_TTL_SECONDS } = require('./shared/pageSerializer');

const s3 = new S3Client({});

const buildClickHref = (slug, linkKey) =>
  `/l/${Buffer.from(`${slug}:${linkKey}`).toString('base64url')}`;

exports.handler = async (event) => {
  const slug = event.pathParameters?.slug;
  if (!slug) {
    return respond(404, { error: 'Page not found' });
  }

  const bucket = process.env.STORAGE_BUCKET_NAME;

  try {
    const page = await getPageBySlug(slug);

    if (!page || page.status !== 'published') {
      return respond(404, { error: 'Page not found' });
    }

    const avatarUrl = page.avatarKey
      ? await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: page.avatarKey }),
          { expiresIn: AVATAR_URL_TTL_SECONDS }
        )
      : null;

    const links = Array.isArray(page.links) ? [...page.links] : [];
    links.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    /** @type {PublicPage} */
    const payload = {
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

    return respond(200, payload);
  } catch (err) {
    console.error('public-page-get error:', err);
    return respond(500, { error: 'Failed to load page' });
  }
};
