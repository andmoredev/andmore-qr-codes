/**
 * GET /analytics/summary
 *
 * Returns a DashboardSummary for the authenticated caller:
 *   - totalQrs / totalPages (non-deleted)
 *   - scansLast30Days / clicksLast30Days
 *   - recentQrs / recentPages (top 5 by updatedAt desc)
 *   - scansByDay bucket across the last 30 days
 *   - byCountry: top-10 countries across all scan events in the window
 *
 * Scan/click counts are derived by fan-out Query per QR (and per link, for
 * page-backed QRs) over the AggregatesTable. Each per-QR query window is ~31
 * rows instead of `scansLast30Days` raw events — orders of magnitude cheaper.
 */
const { respond } = require('./shared/cors');
const {
  listUserQrs,
  listUserPages,
  getPageByUser,
} = require('./shared/repo/appTable');
const {
  queryDailyTotals,
  queryCountryBreakdown,
} = require('./shared/repo/aggregatesTable');

const DAY_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 10;

/** Tiny inline p-limit: run `tasks` N at a time, preserving order. */
const pMap = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
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

const isLive = (item) => item && item.deleted !== true;

const sumCounts = (rows) => rows.reduce((acc, r) => acc + Number(r.count ?? 0), 0);

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  try {
    const [qrs, pages] = await Promise.all([listUserQrs(userId), listUserPages(userId)]);
    const liveQrs = qrs.filter(isLive);
    const livePages = pages.filter(isLive);

    // 30-day window, inclusive.
    const now = new Date();
    const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const fromDate = new Date(todayUtcMidnight.getTime() - 30 * DAY_MS);
    const toDate = new Date(todayUtcMidnight.getTime() + (DAY_MS - 1));
    const fromDay = fromDate.toISOString().slice(0, 10);
    const toDay = toDate.toISOString().slice(0, 10);

    // For click counts, we need each page-backed QR's linkKeys. Batch the page
    // lookups up front so we can avoid repeating them per-QR when multiple QRs
    // point at the same page.
    const pageIdsNeeded = new Set(liveQrs.filter((q) => q.type === 'page' && q.pageId).map((q) => q.pageId));
    const pagesById = new Map();
    for (const p of livePages) pagesById.set(p.pageId, p);
    const missingPageIds = [...pageIdsNeeded].filter((id) => !pagesById.has(id));
    const fetchedPages = await pMap(missingPageIds, CONCURRENCY, (pageId) => getPageByUser(userId, pageId));
    fetchedPages.forEach((p, i) => { if (p) pagesById.set(missingPageIds[i], p); });

    // Fan-out aggregate queries, capped at CONCURRENCY.
    const qrAggregateResults = await pMap(liveQrs, CONCURRENCY, async (qr) => {
      const qrPk = `QR#${qr.qrId}`;
      const [scanDaily, scanCountry] = await Promise.all([
        queryDailyTotals({ pk: qrPk, from: fromDay, to: toDay }),
        queryCountryBreakdown({ pk: qrPk, from: fromDay, to: toDay }),
      ]);

      let clickDaily = [];
      if (qr.type === 'page' && qr.pageId) {
        const page = pagesById.get(qr.pageId);
        const linkKeys = Array.isArray(page?.links) ? page.links.map((l) => l.linkKey).filter(Boolean) : [];
        if (linkKeys.length > 0) {
          const linkBatches = await Promise.all(
            linkKeys.map((linkKey) => queryDailyTotals({
              pk: `LINK#${qr.qrId}#${linkKey}`,
              from: fromDay,
              to: toDay,
            })),
          );
          clickDaily = linkBatches.flat();
        }
      }

      return { scanDaily, scanCountry, clickDaily };
    });

    let scansLast30Days = 0;
    let clicksLast30Days = 0;
    const scansByDay = new Map();
    const scansByCountry = new Map();
    for (const { scanDaily, scanCountry, clickDaily } of qrAggregateResults) {
      scansLast30Days += sumCounts(scanDaily);
      clicksLast30Days += sumCounts(clickDaily);
      for (const r of scanDaily) {
        if (!r.date) continue;
        scansByDay.set(r.date, (scansByDay.get(r.date) ?? 0) + Number(r.count ?? 0));
      }
      for (const r of scanCountry) {
        const country = typeof r.country === 'string' ? r.country.trim() : '';
        if (!country) continue;
        scansByCountry.set(country, (scansByCountry.get(country) ?? 0) + Number(r.count ?? 0));
      }
    }

    const days = enumerateDays(fromDate, toDate);
    const scansByDayArr = days.map((bucket) => ({ bucket, count: scansByDay.get(bucket) ?? 0 }));

    const byCountry = [...scansByCountry.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
      .slice(0, 10);

    const byUpdatedDesc = (a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));

    const recentQrs = [...liveQrs]
      .sort(byUpdatedDesc)
      .slice(0, 5)
      .map((q) => ({ qrId: q.qrId, name: q.name, type: q.type, updatedAt: q.updatedAt }));

    const recentPages = [...livePages]
      .sort(byUpdatedDesc)
      .slice(0, 5)
      .map((p) => ({
        pageId: p.pageId,
        slug: p.slug,
        displayName: p.displayName,
        status: p.status,
        updatedAt: p.updatedAt,
      }));

    const summary = {
      totalQrs: liveQrs.length,
      totalPages: livePages.length,
      scansLast30Days,
      clicksLast30Days,
      recentQrs,
      recentPages,
      scansByDay: scansByDayArr,
      byCountry,
    };

    return respond(200, summary);
  } catch (err) {
    console.error('analytics-summary error:', err);
    return respond(500, { error: 'Failed to load dashboard summary' });
  }
};
