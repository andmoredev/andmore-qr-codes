const { createHash } = require('crypto');
const { redirect } = require('./shared/cors');
const { getPageBySlug } = require('./shared/repo/appTable');
const { putClickEvent } = require('./shared/repo/eventsTable');

const getHeader = (headers, name) => {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
};

const detectDeviceType = (ua) => {
  if (!ua) return 'unknown';
  const s = ua.toLowerCase();
  if (/bot|crawler|spider|crawling|slurp|facebookexternalhit|curl|wget|python-requests|httpclient|okhttp/.test(s)) {
    return 'bot';
  }
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile|windows phone/.test(s)) {
    return 'mobile';
  }
  if (/mozilla|chrome|safari|firefox|edge|opera|msie|trident/.test(s)) {
    return 'desktop';
  }
  return 'unknown';
};

const hashValue = (value) => {
  if (!value) return '';
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
};

const getSourceIp = (event) => {
  const xff = getHeader(event.headers, 'X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();
  return event.requestContext?.identity?.sourceIp ?? '';
};

const decodeClickId = (clickId) => {
  try {
    const decoded = Buffer.from(clickId, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 2) return null;
    const [slug, linkKey] = parts;
    if (!slug || !linkKey) return null;
    return { slug, linkKey };
  } catch (_err) {
    return null;
  }
};

/**
 * Build the `/p/unavailable` URL for this request. Always returns a string
 * suitable for a `Location:` header.
 *
 * Preference order:
 *  1. `PUBLIC_BASE_URL` env var (set by CFN to the CloudFront domain).
 *  2. `https://${Host}` from the viewer request — CloudFront's
 *     PublicApiOriginRequestPolicy strips Host before it reaches the Lambda,
 *     so this mostly helps outside CloudFront (e.g. direct API Gateway hit
 *     during a test).
 *  3. Last-resort: the **relative** path `/p/unavailable`. Browsers resolve
 *     relative `Location` headers against the request URL, which is the
 *     CloudFront domain the viewer actually hit — exactly the destination we
 *     want. This guarantees we never return a non-302 from this handler.
 */
const buildFallbackUrl = (event) => {
  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (publicBase) return `${publicBase}/p/unavailable`;
  const hostHeader = getHeader(event?.headers, 'Host');
  if (hostHeader) return `https://${hostHeader}/p/unavailable`;
  // Relative fallback — resolved against the viewer's CloudFront URL.
  return '/p/unavailable';
};

/**
 * GET /l/{clickId} — resolve a link click on a Links Page and 302 to the link URL.
 * Records a click event when ?src=<qrId> is present (QR-originated click).
 *
 * IMPORTANT: this handler must always 302 — never 4xx/5xx. CloudFront's
 * distribution-level CustomErrorResponses rewrites every 4xx from any origin
 * (including PublicApi) to `/index.html`, which loads the SPA and bounces
 * through ProtectedRoute to `/login`. Returning a 302 to `/p/unavailable`
 * keeps the viewer on the friendly "not available" page instead.
 */
exports.handler = async (event) => {
  const fallbackLocation = buildFallbackUrl(event);

  const clickId = event.pathParameters?.clickId;
  if (!clickId) return redirect(fallbackLocation);

  const decoded = decodeClickId(clickId);
  if (!decoded) return redirect(fallbackLocation);

  const { slug, linkKey } = decoded;

  let page;
  try {
    page = await getPageBySlug(slug);
  } catch (err) {
    console.error('getPageBySlug failed', { slug, err });
    return redirect(fallbackLocation);
  }
  if (!page || !Array.isArray(page.links)) {
    return redirect(fallbackLocation);
  }

  const link = page.links.find((l) => l && l.linkKey === linkKey);
  if (!link || !link.url) return redirect(fallbackLocation);

  const src = event.queryStringParameters?.src;
  if (src) {
    const ua = getHeader(event.headers, 'User-Agent');
    const referrer = getHeader(event.headers, 'Referer');
    const country = getHeader(event.headers, 'CloudFront-Viewer-Country');
    const ip = getSourceIp(event);

    try {
      await putClickEvent({
        qrId: src,
        linkKey,
        country: country || undefined,
        deviceType: detectDeviceType(ua),
        referrer: referrer || undefined,
        uaHash: hashValue(ua || ''),
        ipHash: hashValue(ip || ''),
      });
    } catch (err) {
      // Never fail a redirect because of analytics — log and continue.
      console.error('putClickEvent failed', { qrId: src, linkKey, err });
    }
  }

  return redirect(link.url);
};
