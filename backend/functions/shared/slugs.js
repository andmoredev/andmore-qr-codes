/**
 * Slug validation + reserved slug list shared by Links Page handlers.
 */

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const MIN_LEN = 3;
const MAX_LEN = 30;

const RESERVED_SLUGS = new Set([
  'unavailable',
  'admin',
  'api',
  'login',
  'signup',
  'p',
  'r',
  'l',
  'public',
  'assets',
  'static',
  'dashboard',
]);

/**
 * Validate a slug. Returns `null` if valid, or an error message.
 * @param {unknown} slug
 * @returns {string | null}
 */
function validateSlug(slug) {
  if (typeof slug !== 'string') return 'slug must be a string';
  if (slug.length < MIN_LEN || slug.length > MAX_LEN) {
    return `slug must be between ${MIN_LEN} and ${MAX_LEN} characters`;
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'slug must be lowercase a-z, 0-9, or hyphens and cannot start or end with a hyphen';
  }
  return null;
}

/**
 * @param {string} slug
 */
function isReserved(slug) {
  return RESERVED_SLUGS.has(slug);
}

module.exports = { validateSlug, isReserved, RESERVED_SLUGS, SLUG_REGEX };
