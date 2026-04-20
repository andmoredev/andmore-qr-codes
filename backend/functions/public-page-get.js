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
 * - Draft pages (status !== 'published') return 404. The authenticated
 *   `/pages/{pageId}/preview` endpoint (workstream M) allows owners to see
 *   draft pages without publishing — same payload, built via the shared
 *   `buildPublicPagePayload` helper below.
 *
 * @typedef {import('./shared/types').PublicPage} PublicPage
 */

const { respond } = require('./shared/cors');
const { getPageBySlug } = require('./shared/repo/appTable');
const { buildPublicPagePayload } = require('./shared/publicPageView');

exports.handler = async (event) => {
  const slug = event.pathParameters?.slug;
  if (!slug) {
    return respond(404, { error: 'Page not found' });
  }

  try {
    const page = await getPageBySlug(slug);

    if (!page || page.status !== 'published') {
      return respond(404, { error: 'Page not found' });
    }

    const payload = await buildPublicPagePayload(page);
    return respond(200, payload);
  } catch (err) {
    console.error('public-page-get error:', err);
    return respond(500, { error: 'Failed to load page' });
  }
};
