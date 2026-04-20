/**
 * PATCH /pages/{pageId} — update a Links Page.
 *
 * Behavior:
 *   - Snapshots the current (pre-update) state at V#{currentVersion} and
 *     bumps `currentVersion` by 1.
 *   - If `slug` changes, the old slug reservation is freed and the new one
 *     claimed atomically in the same transaction (409 on conflict).
 *   - If `avatarBase64` is included, stores it at
 *     `avatars/{userId}/{pageId}/v{newVersion}.png` and sets `avatarKey`.
 *
 * Responses: 200 { LinkPage } | 400 | 404 | 409 | 500.
 */

const { respond } = require('./shared/cors');
const { validateSlug, isReserved } = require('./shared/slugs');
const { normalizeLinks } = require('./shared/linkItems');
const {
  getPageByUser,
  reserveSlugAndPutPage,
  updatePageWithVersion,
  isSlugConflict,
} = require('./shared/repo/appTable');
const { uploadAvatar } = require('./shared/avatar');
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

  let current;
  try {
    current = await getPageByUser(userId, pageId);
  } catch (err) {
    console.error('pages-update fetch error', err);
    return respond(500, { error: 'Failed to fetch page' });
  }
  if (!current) return respond(404, { error: 'Page not found' });

  const nextVersion = (current.currentVersion ?? 0) + 1;
  const now = new Date().toISOString();
  const updated = { ...current, updatedAt: now, currentVersion: nextVersion };

  // ── Field-by-field merge ────────────────────────────────────────────────
  let newSlug = current.slug;
  if (body.slug !== undefined) {
    const candidate = typeof body.slug === 'string' ? body.slug.toLowerCase() : body.slug;
    const slugError = validateSlug(candidate);
    if (slugError) return respond(400, { error: slugError });
    if (isReserved(candidate) && candidate !== current.slug) {
      return respond(409, { error: 'slug already taken' });
    }
    newSlug = candidate;
    updated.slug = candidate;
  }

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string' || !body.displayName.trim()) {
      return respond(400, { error: 'displayName must be a non-empty string' });
    }
    updated.displayName = body.displayName.trim();
  }

  if (body.bio !== undefined) {
    if (typeof body.bio !== 'string') return respond(400, { error: 'bio must be a string' });
    updated.bio = body.bio;
  }

  if (body.theme !== undefined) {
    if (body.theme !== 'light' && body.theme !== 'dark') {
      return respond(400, { error: 'theme must be "light" or "dark"' });
    }
    updated.theme = body.theme;
  }

  if (body.accentColor !== undefined) {
    if (typeof body.accentColor !== 'string') {
      return respond(400, { error: 'accentColor must be a string' });
    }
    updated.accentColor = body.accentColor;
  }

  if (body.links !== undefined) {
    const { items, error } = normalizeLinks(body.links);
    if (error) return respond(400, { error });
    updated.links = items;
  }

  // ── Optional avatar upload (keyed by the new version number) ────────────
  if (typeof body.avatarBase64 === 'string' && body.avatarBase64.length > 0) {
    try {
      updated.avatarKey = await uploadAvatar({
        userId,
        pageId,
        version: nextVersion,
        base64: body.avatarBase64,
      });
    } catch (err) {
      console.error('avatar upload failed', err);
      return respond(500, { error: 'Failed to upload avatar' });
    }
  }

  // ── Snapshot the PRIOR state under V#{current.currentVersion} ───────────
  // The snapshot stores the page exactly as it was before this PATCH, so a
  // later restore can reconstruct it. Strip pk/sk from the source item.
  const snapshotSource = { ...current };
  delete snapshotSource.pk;
  delete snapshotSource.sk;
  const versionItem = buildVersionItem(snapshotSource, current.currentVersion ?? 1);

  try {
    if (newSlug !== current.slug) {
      await reserveSlugAndPutPage({
        pageItem: updated,
        slug: newSlug,
        previousSlug: current.slug,
        versionItem,
      });
    } else {
      await updatePageWithVersion({ pageItem: updated, versionItem });
    }
    return respond(200, await serializePage(updated));
  } catch (err) {
    if (isSlugConflict(err)) {
      return respond(409, { error: 'slug already taken' });
    }
    console.error('pages-update error', err);
    return respond(500, { error: 'Failed to update page' });
  }
};
