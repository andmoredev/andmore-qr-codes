/**
 * POST /pages — create a new Links Page (starts in `draft` status).
 *
 * Body: { slug, displayName, bio?, theme?, accentColor?, links?, avatarBase64? }
 * Response:
 *   201 { LinkPage }
 *   400 { error } on invalid body
 *   409 { error: 'slug already taken' } on slug conflict or reserved slug
 *   500 on any other failure
 */

const { respond } = require('./shared/cors');
const { newPageId } = require('./shared/ids');
const { validateSlug, isReserved } = require('./shared/slugs');
const { normalizeLinks } = require('./shared/linkItems');
const { reserveSlugAndPutPage, isSlugConflict } = require('./shared/repo/appTable');
const { uploadAvatar } = require('./shared/avatar');
const { uploadBanner } = require('./shared/banner');
const { serializePage, buildVersionItem } = require('./shared/pageSerializer');

const DEFAULT_THEME = 'dark';
const DEFAULT_ACCENT = '#22C55E';
const DEFAULT_TEMPLATE = 'classic';
const VALID_TEMPLATES = new Set(['classic', 'spotlight', 'marquee']);

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const slug = typeof body.slug === 'string' ? body.slug.toLowerCase() : body.slug;
  const slugError = validateSlug(slug);
  if (slugError) return respond(400, { error: slugError });
  if (isReserved(slug)) return respond(409, { error: 'slug already taken' });

  if (typeof body.displayName !== 'string' || !body.displayName.trim()) {
    return respond(400, { error: 'displayName is required' });
  }
  const displayName = body.displayName.trim();
  const bio = typeof body.bio === 'string' ? body.bio : '';

  const theme = body.theme === 'light' || body.theme === 'dark' ? body.theme : DEFAULT_THEME;
  const accentColor = typeof body.accentColor === 'string' ? body.accentColor : DEFAULT_ACCENT;

  let template = DEFAULT_TEMPLATE;
  if (body.template !== undefined) {
    if (typeof body.template !== 'string' || !VALID_TEMPLATES.has(body.template)) {
      return respond(400, { error: 'template must be one of: classic, spotlight, marquee' });
    }
    template = body.template;
  }

  const { items: links, error: linksError } = normalizeLinks(body.links);
  if (linksError) return respond(400, { error: linksError });

  const pageId = newPageId();
  const now = new Date().toISOString();

  const pageItem = {
    pageId,
    userId,
    slug,
    displayName,
    bio,
    theme,
    template,
    accentColor,
    links,
    status: 'draft',
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  };

  // Optional avatar upload — key is stored on the page item.
  if (typeof body.avatarBase64 === 'string' && body.avatarBase64.length > 0) {
    try {
      pageItem.avatarKey = await uploadAvatar({
        userId,
        pageId,
        version: 1,
        base64: body.avatarBase64,
      });
    } catch (err) {
      console.error('avatar upload failed', err);
      return respond(500, { error: 'Failed to upload avatar' });
    }
  }

  // Optional banner upload.
  if (typeof body.bannerBase64 === 'string' && body.bannerBase64.length > 0) {
    try {
      pageItem.bannerKey = await uploadBanner({
        userId,
        pageId,
        version: 1,
        base64: body.bannerBase64,
      });
    } catch (err) {
      console.error('banner upload failed', err);
      return respond(500, { error: 'Failed to upload banner' });
    }
  }

  try {
    const versionItem = buildVersionItem(pageItem, 1);
    await reserveSlugAndPutPage({ pageItem, slug, versionItem });
    const serialized = await serializePage(pageItem);
    return respond(201, serialized);
  } catch (err) {
    if (isSlugConflict(err)) {
      return respond(409, { error: 'slug already taken' });
    }
    console.error('pages-create error', err);
    return respond(500, { error: 'Failed to create page' });
  }
};
