/**
 * GET /pages/{pageId} — fetch a single Links Page owned by the caller.
 *
 * Response: 200 { LinkPage } | 404 { error }.
 */

const { respond } = require('./shared/cors');
const { getPageByUser } = require('./shared/repo/appTable');
const { serializePage } = require('./shared/pageSerializer');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const pageId = event.pathParameters?.pageId;
  if (!pageId) return respond(400, { error: 'pageId is required' });

  try {
    const page = await getPageByUser(userId, pageId);
    if (!page) return respond(404, { error: 'Page not found' });
    return respond(200, await serializePage(page));
  } catch (err) {
    console.error('pages-get error', err);
    return respond(500, { error: 'Failed to fetch page' });
  }
};
