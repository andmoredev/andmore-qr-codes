const { createHash } = require('crypto');
const { redirect } = require('./shared/cors');
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
 * All `/p/*` redirects are emitted as **relative** `Location:` values. Browsers
 * resolve relative `Location` against the viewer's effective request URI,
 * which is the CloudFront domain the phone actually hit — exactly where we
 * want them to land. Using relative URLs avoids two recurring footguns:
 *
 *  - `PUBLIC_BASE_URL` env var accidentally empty after a deploy that forgot
 *    `--parameter-overrides PublicBaseUrl=...`, which produced a 302 to `""`.
 *  - `event.headers.Host` pointing at API Gateway's execute-api domain
 *    (CloudFront's origin-request policy strips the viewer Host), producing
 *    a 302 to an API Gateway URL that has no `/p/*` route and returns 403.
 */
const PAGE_UNAVAILABLE = '/p/unavailable';

/**
 * GET /r/{qrId} — resolve a QR scan, record a scan event, 302 to destination.
 *
 * IMPORTANT: this handler must always 302 — never 4xx/5xx. CloudFront's
 * distribution-level CustomErrorResponses rewrites every 4xx from any origin
 * (including PublicApi) to `/index.html`, which loads the SPA and bounces
 * through ProtectedRoute to `/login`. Returning a 302 to `/p/unavailable`
 * keeps the viewer on the friendly "not available" page instead.
 */
exports.handler = async (event) => {
  const qrId = event.pathParameters?.qrId;
  if (!qrId) return redirect(PAGE_UNAVAILABLE);

  let qrLookup;
  try {
    qrLookup = await getQrLookup(qrId);
  } catch (err) {
    console.error('getQrLookup failed', { qrId, err });
    return redirect(PAGE_UNAVAILABLE);
  }

  if (!qrLookup || qrLookup.enabled === false) {
    return redirect(PAGE_UNAVAILABLE);
  }

  let destination;

  if (qrLookup.type === 'direct') {
    if (!qrLookup.destinationUrl) return redirect(PAGE_UNAVAILABLE);
    destination = qrLookup.destinationUrl;
  } else if (qrLookup.type === 'page') {
    const { userId, pageId } = qrLookup;
    if (!userId || !pageId) return redirect(PAGE_UNAVAILABLE);
    let page;
    try {
      page = await getPageByUser(userId, pageId);
    } catch (err) {
      console.error('getPageByUser failed', { userId, pageId, err });
      return redirect(PAGE_UNAVAILABLE);
    }
    if (!page) return redirect(PAGE_UNAVAILABLE);
    if (page.status !== 'published') {
      destination = PAGE_UNAVAILABLE;
    } else {
      destination = `/p/${encodeURIComponent(page.slug)}?src=${encodeURIComponent(qrId)}`;
    }
  } else {
    return redirect(PAGE_UNAVAILABLE);
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
