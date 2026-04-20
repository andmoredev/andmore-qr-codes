/**
 * POST /pages/{pageId}/versions/{n}/restore — restore a page to snapshot n.
 *
 * Behavior:
 *   - Fetches V#{n} snapshot. 404 if either the page or the snapshot is
 *     missing / not owned by the caller.
 *   - Snapshots the current state under its own version number (so the
 *     restore itself is undoable).
 *   - Bumps `currentVersion` by 1 and writes the restored page item.
 *   - If the snapshot's slug differs from the live page's slug, the new
 *     slug is reserved atomically (may 409 if taken since).
 *
 * Response: 200 { LinkPage } | 404 | 409 | 500.
 */

const { respond } = require('./shared/cors');
const {
  getPageByUser,
  getPageVersion,
  reserveSlugAndPutPage,
  updatePageWithVersion,
  isSlugConflict,
} = require('./shared/repo/appTable');
const { isReserved } = require('./shared/slugs');
const { serializePage, buildVersionItem } = require('./shared/pageSerializer');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const pageId = event.pathParameters?.pageId;
  const nRaw = event.pathParameters?.n;
  const n = Number(nRaw);
  if (!pageId) return respond(400, { error: 'pageId is required' });
  if (!Number.isInteger(n) || n < 1) {
    return respond(400, { error: 'version must be a positive integer' });
  }

  try {
    const current = await getPageByUser(userId, pageId);
    if (!current) return respond(404, { error: 'Page not found' });

    const snapshot = await getPageVersion(pageId, n);
    if (!snapshot || snapshot.userId !== userId) {
      return respond(404, { error: 'Version not found' });
    }

    // Reserved slugs should never round-trip through restore.
    if (isReserved(snapshot.slug) && snapshot.slug !== current.slug) {
      return respond(409, { error: 'slug already taken' });
    }

    const now = new Date().toISOString();
    const nextVersion = (current.currentVersion ?? 0) + 1;

    // Rebuild the live page from the snapshot, preserving identity + new version bump.
    const restored = {
      ...snapshot,
      pageId,
      userId,
      currentVersion: nextVersion,
      updatedAt: now,
      // Preserve original createdAt of the page entity.
      createdAt: current.createdAt,
    };
    delete restored.pk;
    delete restored.sk;
    delete restored.version;
    delete restored.versionedAt;
    delete restored.note;

    // Snapshot the pre-restore state under its own version number, so the
    // restore itself can be reverted later.
    const snapshotSource = { ...current };
    delete snapshotSource.pk;
    delete snapshotSource.sk;
    const versionItem = buildVersionItem(
      snapshotSource,
      current.currentVersion ?? 1,
      `restore-from-v${n}`,
    );

    if (restored.slug !== current.slug) {
      await reserveSlugAndPutPage({
        pageItem: restored,
        slug: restored.slug,
        previousSlug: current.slug,
        versionItem,
      });
    } else {
      await updatePageWithVersion({ pageItem: restored, versionItem });
    }

    return respond(200, await serializePage(restored));
  } catch (err) {
    if (isSlugConflict(err)) {
      return respond(409, { error: 'slug already taken' });
    }
    console.error('pages-versions-restore error', err);
    return respond(500, { error: 'Failed to restore version' });
  }
};
