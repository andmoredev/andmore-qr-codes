/**
 * GET /analytics/qrs/{qrId}?from&to
 *
 * Returns an AnalyticsSummary for a single QR owned by the caller, aggregating
 * scan events from EventsTable and — when the QR is page-backed — click events
 * across every link on the current page version.
 *
 * Query params:
 *   - from, to: ISO dates (YYYY-MM-DD). Default window: last 30 days (today-30d .. today).
 *
 * Response: shared/types.ts#AnalyticsSummary
 */
const { respond } = require('./shared/cors');
const { getQrByUser, getPageByUser } = require('./shared/repo/appTable');
const { queryScans, queryClicks } = require('./shared/repo/eventsTable');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD string and return a Date at start-of-day UTC. */
const parseFromDate = (input) => {
  if (!input) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Parse a YYYY-MM-DD string and return a Date at end-of-day UTC. */
const parseToDate = (input) => {
  if (!input) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return null;
  const d = new Date(`${input}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Inclusive list of YYYY-MM-DD bucket keys between two UTC dates. */
const enumerateDays = (fromDate, toDate) => {
  const days = [];
  const startUtc = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate());
  const endUtc = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate());
  for (let ms = startUtc; ms <= endUtc; ms += DAY_MS) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
};

/** Count events into { byDay, byCountry, byDevice }. */
const aggregateEvents = (events) => {
  const byDay = new Map();
  const byCountry = new Map();
  const byDevice = new Map();
  for (const evt of events) {
    const bucket = typeof evt.ts === 'string' ? evt.ts.slice(0, 10) : null;
    if (bucket) byDay.set(bucket, (byDay.get(bucket) ?? 0) + 1);
    if (evt.country) byCountry.set(evt.country, (byCountry.get(evt.country) ?? 0) + 1);
    const device = evt.deviceType ?? 'unknown';
    byDevice.set(device, (byDevice.get(device) ?? 0) + 1);
  }
  return { byDay, byCountry, byDevice };
};

const toSortedDayArray = (countsByDay, allDays) =>
  allDays.map((bucket) => ({ bucket, count: countsByDay.get(bucket) ?? 0 }));

const toTopCountryArray = (byCountry, n = 10) =>
  [...byCountry.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);

const toDeviceArray = (byDevice) =>
  [...byDevice.entries()]
    .map(([deviceType, count]) => ({ deviceType, count }))
    .sort((a, b) => b.count - a.count);

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const qrId = event.pathParameters?.qrId;
  if (!qrId) return respond(400, { error: 'Missing qrId' });

  const qr = await getQrByUser(userId, qrId);
  if (!qr) return respond(404, { error: 'QR not found' });

  // Default window: last 30 days (today-30d .. today), inclusive.
  const qs = event.queryStringParameters ?? {};
  const now = new Date();
  const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultFrom = new Date(todayUtcMidnight.getTime() - 30 * DAY_MS);

  const fromDate = parseFromDate(qs.from) ?? defaultFrom;
  const toDate = parseToDate(qs.to) ?? new Date(todayUtcMidnight.getTime() + (DAY_MS - 1));
  if (fromDate > toDate) return respond(400, { error: '`from` must be on or before `to`' });

  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  try {
    // Scans — always queried.
    const scansPromise = queryScans({ qrId, from: fromIso, to: toIso });

    // Clicks — only for page-backed QRs, fanned out across every linkKey on the page.
    let clicksPromise = Promise.resolve([]);
    let linkKeys = [];
    if (qr.type === 'page' && qr.pageId) {
      const page = await getPageByUser(userId, qr.pageId);
      linkKeys = Array.isArray(page?.links) ? page.links.map((l) => l.linkKey).filter(Boolean) : [];
      if (linkKeys.length > 0) {
        clicksPromise = Promise.all(
          linkKeys.map((linkKey) => queryClicks({ qrId, linkKey, from: fromIso, to: toIso }))
        ).then((results) => results.flat());
      }
    }

    const [scans, clicks] = await Promise.all([scansPromise, clicksPromise]);

    const days = enumerateDays(fromDate, toDate);
    const scanAgg = aggregateEvents(scans);
    const clickAgg = aggregateEvents(clicks);

    // Combined byDay = scans + clicks per day.
    const combinedByDay = new Map();
    for (const [day, count] of scanAgg.byDay) combinedByDay.set(day, (combinedByDay.get(day) ?? 0) + count);
    for (const [day, count] of clickAgg.byDay) combinedByDay.set(day, (combinedByDay.get(day) ?? 0) + count);

    const combinedByCountry = new Map();
    for (const [c, n] of scanAgg.byCountry) combinedByCountry.set(c, (combinedByCountry.get(c) ?? 0) + n);
    for (const [c, n] of clickAgg.byCountry) combinedByCountry.set(c, (combinedByCountry.get(c) ?? 0) + n);

    const combinedByDevice = new Map();
    for (const [d, n] of scanAgg.byDevice) combinedByDevice.set(d, (combinedByDevice.get(d) ?? 0) + n);
    for (const [d, n] of clickAgg.byDevice) combinedByDevice.set(d, (combinedByDevice.get(d) ?? 0) + n);

    const byLink = qr.type === 'page'
      ? (() => {
        const counts = new Map();
        for (const key of linkKeys) counts.set(key, 0);
        for (const evt of clicks) {
          if (!evt.linkKey) continue;
          counts.set(evt.linkKey, (counts.get(evt.linkKey) ?? 0) + 1);
        }
        return [...counts.entries()]
          .map(([linkKey, count]) => ({ linkKey, count }))
          .sort((a, b) => b.count - a.count);
      })()
      : undefined;

    const summary = {
      qrId,
      totalScans: scans.length,
      totalClicks: clicks.length,
      byDay: toSortedDayArray(combinedByDay, days),
      byCountry: toTopCountryArray(combinedByCountry, 10),
      byDevice: toDeviceArray(combinedByDevice),
      ...(byLink ? { byLink } : {}),
    };

    return respond(200, summary);
  } catch (err) {
    console.error('analytics-qr error:', err);
    return respond(500, { error: 'Failed to load analytics' });
  }
};
