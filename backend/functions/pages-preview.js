/**
 * GET /pages/{pageId}/preview — authenticated owner-scoped draft preview.
 *
 * Lets a Links Page owner render a draft page through the same `PublicPage`
 * payload shape as `/public/pages/{slug}` — without publishing it. The
 * endpoint is wired on the authenticated `QrRestApi` (Cognito JWT) and is
 * strictly owner-scoped: non-owners receive 404 (no information leak about
 * whether the page exists).
 *
 * Response shape is identical to `GET /public/pages/{slug}`, regardless of
 * `status`, so the SPA can reuse `<PublicPageView>` verbatim. The only
 * differences vs. the public endpoint are:
 *   - Auth is required (Cognito).
 *   - `status` is not filtered — drafts render.
 *   - Lookup is owner-scoped by (userId, pageId) rather than slug reservation.
 *
 * @typedef {import('./shared/types').PublicPage} PublicPage
 */

const { respond } = require('./shared/cors');
const { getPageByUser } = require('./shared/repo/appTable');
const { buildPublicPagePayload } = require('./shared/publicPageView');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const pageId = event.pathParameters?.pageId;
  if (!pageId) return respond(400, { error: 'pageId is required' });

  try {
    const page = await getPageByUser(userId, pageId);
    if (!page) return respond(404, { error: 'Page not found' });

    const payload = await buildPublicPagePayload(page);
    return respond(200, payload);
  } catch (err) {
    console.error('pages-preview error:', err);
    return respond(500, { error: 'Failed to load preview' });
  }
};
