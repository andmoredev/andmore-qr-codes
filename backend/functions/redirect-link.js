const { createHash } = require('crypto');
const { respond, redirect } = require('./shared/cors');
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
 * GET /l/{clickId} — resolve a link click on a Links Page and 302 to the link URL.
 * Records a click event when ?src=<qrId> is present (QR-originated click).
 */
exports.handler = async (event) => {
  const clickId = event.pathParameters?.clickId;
  if (!clickId) return respond(404, { error: 'Not found' });

  const decoded = decodeClickId(clickId);
  if (!decoded) return respond(404, { error: 'Not found' });

  const { slug, linkKey } = decoded;

  let page;
  try {
    page = await getPageBySlug(slug);
  } catch (err) {
    console.error('getPageBySlug failed', { slug, err });
    return respond(500, { error: 'Internal server error' });
  }
  if (!page || !Array.isArray(page.links)) {
    return respond(404, { error: 'Not found' });
  }

  const link = page.links.find((l) => l && l.linkKey === linkKey);
  if (!link || !link.url) return respond(404, { error: 'Not found' });

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
