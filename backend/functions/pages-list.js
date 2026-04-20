/**
 * GET /pages — list the authenticated caller's Links Pages.
 *
 * Response: 200 { items: LinkPage[] } with presigned avatar URLs (1h TTL).
 */

const { respond } = require('./shared/cors');
const { listUserPages } = require('./shared/repo/appTable');
const { serializePage } = require('./shared/pageSerializer');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  try {
    const pages = await listUserPages(userId);
    const items = await Promise.all(pages.map(serializePage));
    return respond(200, { items });
  } catch (err) {
    console.error('pages-list error', err);
    return respond(500, { error: 'Failed to list pages' });
  }
};
