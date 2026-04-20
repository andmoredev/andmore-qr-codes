/**
 * GET /analytics/qrs/{qrId}?from&to
 *
 * Returns an AnalyticsSummary for a single QR owned by the caller. Scan totals
 * come from AggregatesTable (daily aggregates maintained by the Stream-driven
 * AggregatorFunction). Click totals are fetched per-linkKey for page-backed
 * QRs. Aggregates lag raw events by a few seconds — acceptable for this UI.
 *
 * Query params:
 *   - from, to: ISO dates (YYYY-MM-DD). Default window: last 30 days (today-30d .. today).
 *
 * Response: shared/types.ts#AnalyticsSummary
 */
const { respond } = require('./shared/cors');
const { getQrByUser, getPageByUser } = require('./shared/repo/appTable');
const {
  queryDailyTotals,
  queryCountryBreakdown,
  queryDeviceBreakdown,
} = require('./shared/repo/aggregatesTable');

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

/** Sum a list of { date, count } into a Map keyed by date. */
const sumByDay = (rows) => {
  const m = new Map();
  for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + Number(r.count ?? 0));
  return m;
};

/** Merge two breakdown lists ({ key, count }[]) into a Map keyed by the shared key. */
const mergeBreakdown = (target, rows, keyField) => {
  for (const r of rows) {
    const k = r[keyField];
    if (!k) continue;
    target.set(k, (target.get(k) ?? 0) + Number(r.count ?? 0));
  }
  return target;
};

const toSortedDayArray = (countsByDay, allDays) =>
  allDays.map((bucket) => ({ bucket, count: countsByDay.get(bucket) ?? 0 }));

const toTopCountryArray = (byCountry, n = 10) =>
  [...byCountry.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
    .slice(0, n);

const toDeviceArray = (byDevice) =>
  [...byDevice.entries()]
    .map(([deviceType, count]) => ({ deviceType, count }))
    .sort((a, b) => b.count - a.count || a.deviceType.localeCompare(b.deviceType));

const sumCounts = (rows) => rows.reduce((acc, r) => acc + Number(r.count ?? 0), 0);

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

  const fromDay = fromDate.toISOString().slice(0, 10);
  const toDay = toDate.toISOString().slice(0, 10);
  const qrPk = `QR#${qrId}`;

  try {
    // Scans — always queried from AggregatesTable.
    const scanDailyPromise = queryDailyTotals({ pk: qrPk, from: fromDay, to: toDay });
    const scanCountryPromise = queryCountryBreakdown({ pk: qrPk, from: fromDay, to: toDay });
    const scanDevicePromise = queryDeviceBreakdown({ pk: qrPk, from: fromDay, to: toDay });

    // Clicks — only for page-backed QRs, fanned out across every linkKey on the page.
    let linkKeys = [];
    let clicksPerLinkPromise = Promise.resolve([]);
    if (qr.type === 'page' && qr.pageId) {
      const page = await getPageByUser(userId, qr.pageId);
      linkKeys = Array.isArray(page?.links) ? page.links.map((l) => l.linkKey).filter(Boolean) : [];
      if (linkKeys.length > 0) {
        clicksPerLinkPromise = Promise.all(
          linkKeys.map(async (linkKey) => {
            const pk = `LINK#${qrId}#${linkKey}`;
            const [daily, country, device] = await Promise.all([
              queryDailyTotals({ pk, from: fromDay, to: toDay }),
              queryCountryBreakdown({ pk, from: fromDay, to: toDay }),
              queryDeviceBreakdown({ pk, from: fromDay, to: toDay }),
            ]);
            return { linkKey, daily, country, device };
          }),
        );
      }
    }

    const [scanDaily, scanCountry, scanDevice, clicksPerLink] = await Promise.all([
      scanDailyPromise,
      scanCountryPromise,
      scanDevicePromise,
      clicksPerLinkPromise,
    ]);

    const totalScans = sumCounts(scanDaily);
    const totalClicks = clicksPerLink.reduce((acc, l) => acc + sumCounts(l.daily), 0);

    const days = enumerateDays(fromDate, toDate);

    // Combined byDay = scans + all link clicks per day.
    const combinedByDay = sumByDay(scanDaily);
    for (const link of clicksPerLink) {
      for (const r of link.daily) {
        combinedByDay.set(r.date, (combinedByDay.get(r.date) ?? 0) + Number(r.count ?? 0));
      }
    }

    const combinedByCountry = new Map();
    mergeBreakdown(combinedByCountry, scanCountry, 'country');
    for (const link of clicksPerLink) mergeBreakdown(combinedByCountry, link.country, 'country');

    const combinedByDevice = new Map();
    mergeBreakdown(combinedByDevice, scanDevice, 'deviceType');
    for (const link of clicksPerLink) mergeBreakdown(combinedByDevice, link.device, 'deviceType');

    const byLink = qr.type === 'page'
      ? (() => {
        const counts = new Map();
        for (const key of linkKeys) counts.set(key, 0);
        for (const link of clicksPerLink) counts.set(link.linkKey, sumCounts(link.daily));
        return [...counts.entries()]
          .map(([linkKey, count]) => ({ linkKey, count }))
          .sort((a, b) => b.count - a.count);
      })()
      : undefined;

    const summary = {
      qrId,
      totalScans,
      totalClicks,
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
