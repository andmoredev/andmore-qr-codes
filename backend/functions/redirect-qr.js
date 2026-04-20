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
 * Build the `/p/unavailable` URL for this request. Always returns a string
 * suitable for a `Location:` header.
 *
 * Preference order:
 *  1. `PUBLIC_BASE_URL` env var (set by CFN to the CloudFront domain).
 *  2. `https://${Host}` from the viewer request — note CloudFront's
 *     PublicApiOriginRequestPolicy strips Host before it reaches the Lambda,
 *     so this only helps when the function is invoked outside CloudFront
 *     (e.g. directly via API Gateway during a test).
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
 * GET /r/{qrId} — resolve a QR scan, record a scan event, 302 to destination.
 *
 * IMPORTANT: this handler must always 302 — never 4xx/5xx. CloudFront's
 * distribution-level CustomErrorResponses rewrites every 4xx from any origin
 * (including PublicApi) to `/index.html`, which loads the SPA and bounces
 * through ProtectedRoute to `/login`. Returning a 302 to `/p/unavailable`
 * keeps the viewer on the friendly "not available" page instead.
 */
exports.handler = async (event) => {
  const fallbackLocation = buildFallbackUrl(event);

  const qrId = event.pathParameters?.qrId;
  if (!qrId) return redirect(fallbackLocation);

  let qrLookup;
  try {
    qrLookup = await getQrLookup(qrId);
  } catch (err) {
    console.error('getQrLookup failed', { qrId, err });
    return redirect(fallbackLocation);
  }

  if (!qrLookup || qrLookup.enabled === false) {
    return redirect(fallbackLocation);
  }

  // PUBLIC_BASE_URL comes from the CFN PublicBaseUrl parameter. Host header is
  // only a fallback — when CloudFront is fronting PublicApi the Host header is
  // stripped (the origin request policy omits it so API Gateway doesn't 403),
  // so relying on it alone would redirect to the API Gateway domain instead of
  // the user-facing CloudFront/custom domain.
  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const hostHeader = getHeader(event.headers, 'Host') ?? '';
  const baseUrl = publicBase || (hostHeader ? `https://${hostHeader}` : '');
  let destination;

  if (qrLookup.type === 'direct') {
    if (!qrLookup.destinationUrl) return redirect(fallbackLocation);
    destination = qrLookup.destinationUrl;
  } else if (qrLookup.type === 'page') {
    const { userId, pageId } = qrLookup;
    if (!userId || !pageId) return redirect(fallbackLocation);
    if (!baseUrl) {
      console.error('PUBLIC_BASE_URL is not configured and Host header is missing');
      return redirect(fallbackLocation);
    }
    let page;
    try {
      page = await getPageByUser(userId, pageId);
    } catch (err) {
      console.error('getPageByUser failed', { userId, pageId, err });
      return redirect(fallbackLocation);
    }
    if (!page) return redirect(fallbackLocation);
    if (page.status !== 'published') {
      destination = `${baseUrl}/p/unavailable`;
    } else {
      destination = `${baseUrl}/p/${page.slug}?src=${encodeURIComponent(qrId)}`;
    }
  } else {
    return redirect(fallbackLocation);
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
