/**
 * GET /pages/{pageId}/versions — list all snapshots for a page, newest first.
 *
 * Access is gated by ownership of the page. Returns just the version
 * metadata — callers use the restore endpoint to apply a snapshot.
 *
 * Response: 200 { items: VersionMeta[] } | 404.
 */

const { respond } = require('./shared/cors');
const { getPageByUser, listPageVersions } = require('./shared/repo/appTable');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const pageId = event.pathParameters?.pageId;
  if (!pageId) return respond(400, { error: 'pageId is required' });

  try {
    const page = await getPageByUser(userId, pageId);
    if (!page) return respond(404, { error: 'Page not found' });

    const versions = await listPageVersions(pageId);
    const items = versions.map((v) => ({
      version: v.version,
      versionedAt: v.versionedAt,
      ...(v.note ? { note: v.note } : {}),
    }));
    return respond(200, { items });
  } catch (err) {
    console.error('pages-versions-list error', err);
    return respond(500, { error: 'Failed to list versions' });
  }
};
