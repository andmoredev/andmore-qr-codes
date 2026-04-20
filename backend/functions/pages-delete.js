/**
 * DELETE /pages/{pageId} — hard-delete a Links Page.
 *
 * Removes the user→page pointer and the slug reservation in a transaction,
 * then drains every version snapshot via BatchWriteItem (25-per-chunk).
 * Returns 204 on success, 404 if the page is not owned by the caller.
 *
 * Avatar S3 objects are intentionally left in place — storage lifecycle
 * rules (future) will reap orphaned avatar/ prefixes.
 */

const { respond } = require('./shared/cors');
const { getPageByUser, deletePage } = require('./shared/repo/appTable');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const pageId = event.pathParameters?.pageId;
  if (!pageId) return respond(400, { error: 'pageId is required' });

  try {
    const page = await getPageByUser(userId, pageId);
    if (!page) return respond(404, { error: 'Page not found' });

    await deletePage({ userId, pageId, slug: page.slug });
    return respond(204, '');
  } catch (err) {
    console.error('pages-delete error', err);
    return respond(500, { error: 'Failed to delete page' });
  }
};
