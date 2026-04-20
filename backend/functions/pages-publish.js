/**
 * POST /pages/{pageId}/publish — toggle a Links Page between draft and
 * published. Each toggle snapshots the prior state and bumps
 * `currentVersion` so publish/unpublish history is preserved.
 *
 * Body:     { published: boolean }
 * Response: 200 { LinkPage } | 400 | 404 | 500.
 */

const { respond } = require('./shared/cors');
const { getPageByUser, updatePageWithVersion } = require('./shared/repo/appTable');
const { serializePage, buildVersionItem } = require('./shared/pageSerializer');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const pageId = event.pathParameters?.pageId;
  if (!pageId) return respond(400, { error: 'pageId is required' });

  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }
  if (typeof body.published !== 'boolean') {
    return respond(400, { error: 'published (boolean) is required' });
  }

  try {
    const current = await getPageByUser(userId, pageId);
    if (!current) return respond(404, { error: 'Page not found' });

    const now = new Date().toISOString();
    const nextVersion = (current.currentVersion ?? 0) + 1;
    const updated = {
      ...current,
      status: body.published ? 'published' : 'draft',
      updatedAt: now,
      currentVersion: nextVersion,
    };

    // Snapshot the prior state under its current version number.
    const snapshotSource = { ...current };
    delete snapshotSource.pk;
    delete snapshotSource.sk;
    const versionItem = buildVersionItem(
      snapshotSource,
      current.currentVersion ?? 1,
      body.published ? 'publish' : 'unpublish',
    );

    await updatePageWithVersion({ pageItem: updated, versionItem });
    return respond(200, await serializePage(updated));
  } catch (err) {
    console.error('pages-publish error', err);
    return respond(500, { error: 'Failed to toggle publish state' });
  }
};
