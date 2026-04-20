/**
 * LinkItem normalization + validation used by page create/update handlers.
 * Mirrors `LinkItem` in `shared/types.ts`.
 */

const { shortId } = require('./ids');

const LINK_KINDS = new Set(['x', 'linkedin', 'youtube', 'github', 'blog', 'custom']);

/**
 * Normalize a single incoming LinkItem: assign a stable `linkKey` if missing,
 * coerce `order` to an integer, and drop unknown fields.
 *
 * Returns `{ item, error }` — `error` is a string when the shape is invalid.
 */
function normalizeLinkItem(raw, fallbackOrder) {
  if (!raw || typeof raw !== 'object') {
    return { error: 'link must be an object' };
  }
  const { kind, label, url, icon } = raw;
  if (!LINK_KINDS.has(kind)) {
    return { error: `link.kind must be one of ${[...LINK_KINDS].join(', ')}` };
  }
  if (typeof label !== 'string' || !label.trim()) {
    return { error: 'link.label is required' };
  }
  if (typeof url !== 'string' || !url.trim()) {
    return { error: 'link.url is required' };
  }
  const order = Number.isInteger(raw.order) ? raw.order : fallbackOrder;
  const linkKey = typeof raw.linkKey === 'string' && raw.linkKey.length > 0
    ? raw.linkKey
    : shortId(8);
  const item = { linkKey, kind, label, url, order };
  if (kind === 'custom' && typeof icon === 'string' && icon.length > 0) {
    item.icon = icon;
  }
  return { item };
}

/**
 * Normalize a list of LinkItem inputs. Returns `{ items, error }`.
 */
function normalizeLinks(rawList) {
  if (rawList === undefined) return { items: [] };
  if (!Array.isArray(rawList)) return { error: 'links must be an array' };
  const items = [];
  for (let i = 0; i < rawList.length; i++) {
    const { item, error } = normalizeLinkItem(rawList[i], i);
    if (error) return { error: `links[${i}]: ${error}` };
    items.push(item);
  }
  return { items };
}

module.exports = { normalizeLinks, normalizeLinkItem, LINK_KINDS };
