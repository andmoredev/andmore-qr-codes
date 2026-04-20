const { createHash } = require('crypto');
const { respond, redirect } = require('./shared/cors');
const { getQrLookup, getPageByUser } = require('./shared/repo/appTable');
const { putScanEvent } = require('./shared/repo/eventsTable');

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

/**
 * GET /r/{qrId} — resolve a QR scan, record a scan event, 302 to destination.
 */
exports.handler = async (event) => {
  const qrId = event.pathParameters?.qrId;
  if (!qrId) return respond(404, { error: 'Not found' });

  let qrLookup;
  try {
    qrLookup = await getQrLookup(qrId);
  } catch (err) {
    console.error('getQrLookup failed', { qrId, err });
    return respond(500, { error: 'Internal server error' });
  }

  if (!qrLookup || qrLookup.enabled === false) {
    return respond(404, { error: 'Not found' });
  }

  const host = getHeader(event.headers, 'Host') ?? '';
  let destination;

  if (qrLookup.type === 'direct') {
    if (!qrLookup.destinationUrl) return respond(404, { error: 'Not found' });
    destination = qrLookup.destinationUrl;
  } else if (qrLookup.type === 'page') {
    const { userId, pageId } = qrLookup;
    if (!userId || !pageId) return respond(404, { error: 'Not found' });
    let page;
    try {
      page = await getPageByUser(userId, pageId);
    } catch (err) {
      console.error('getPageByUser failed', { userId, pageId, err });
      return respond(500, { error: 'Internal server error' });
    }
    if (!page) return respond(404, { error: 'Not found' });
    if (page.status !== 'published') {
      destination = `https://${host}/p/unavailable`;
    } else {
      destination = `https://${host}/p/${page.slug}?src=${encodeURIComponent(qrId)}`;
    }
  } else {
    return respond(404, { error: 'Not found' });
  }

  const ua = getHeader(event.headers, 'User-Agent');
  const referrer = getHeader(event.headers, 'Referer');
  const country = getHeader(event.headers, 'CloudFront-Viewer-Country');
  const ip = getSourceIp(event);

  try {
    await putScanEvent({
      qrId,
      country: country || undefined,
      deviceType: detectDeviceType(ua),
      referrer: referrer || undefined,
      uaHash: hashValue(ua || ''),
      ipHash: hashValue(ip || ''),
    });
  } catch (err) {
    // Never fail a redirect because of analytics — log and continue.
    console.error('putScanEvent failed', { qrId, err });
  }

  return redirect(destination);
};
