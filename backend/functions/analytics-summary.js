/**
 * GET /analytics/summary
 *
 * Returns a DashboardSummary for the authenticated caller:
 *   - totalQrs / totalPages (non-deleted)
 *   - scansLast30Days / clicksLast30Days
 *   - recentQrs / recentPages (top 5 by updatedAt desc)
 *   - scansByDay bucket across the last 30 days
 *
 * Performance note (MVP): click/scan counts are derived by fan-out Query per QR
 * over the EventsTable (O(Nqr × events)). Acceptable while Nqr is small; when
 * per-user QR counts grow we should swap to DynamoDB Streams → aggregate table.
 */
const { respond } = require('./shared/cors');
const {
  listUserQrs,
  listUserPages,
  getPageByUser,
} = require('./shared/repo/appTable');
const { queryScans, queryClicks } = require('./shared/repo/eventsTable');

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
    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();

    // For click counts, we need each page-backed QR's linkKeys. Batch the page
    // lookups up front so we can avoid repeating them per-QR when multiple QRs
    // point at the same page.
    const pageIdsNeeded = new Set(liveQrs.filter((q) => q.type === 'page' && q.pageId).map((q) => q.pageId));
    const pagesById = new Map();
    for (const p of livePages) pagesById.set(p.pageId, p);
    const missingPageIds = [...pageIdsNeeded].filter((id) => !pagesById.has(id));
    const fetchedPages = await pMap(missingPageIds, CONCURRENCY, (pageId) => getPageByUser(userId, pageId));
    fetchedPages.forEach((p, i) => { if (p) pagesById.set(missingPageIds[i], p); });

    // Fan-out event queries, capped at CONCURRENCY.
    const qrEventResults = await pMap(liveQrs, CONCURRENCY, async (qr) => {
      const scans = await queryScans({ qrId: qr.qrId, from: fromIso, to: toIso });
      let clicks = [];
      if (qr.type === 'page' && qr.pageId) {
        const page = pagesById.get(qr.pageId);
        const linkKeys = Array.isArray(page?.links) ? page.links.map((l) => l.linkKey).filter(Boolean) : [];
        if (linkKeys.length > 0) {
          const batches = await Promise.all(
            linkKeys.map((linkKey) => queryClicks({ qrId: qr.qrId, linkKey, from: fromIso, to: toIso }))
          );
          clicks = batches.flat();
        }
      }
      return { scans, clicks };
    });

    let scansLast30Days = 0;
    let clicksLast30Days = 0;
    const scansByDay = new Map();
    for (const { scans, clicks } of qrEventResults) {
      scansLast30Days += scans.length;
      clicksLast30Days += clicks.length;
      for (const evt of scans) {
        const bucket = typeof evt.ts === 'string' ? evt.ts.slice(0, 10) : null;
        if (bucket) scansByDay.set(bucket, (scansByDay.get(bucket) ?? 0) + 1);
      }
    }

    const days = enumerateDays(fromDate, toDate);
    const scansByDayArr = days.map((bucket) => ({ bucket, count: scansByDay.get(bucket) ?? 0 }));

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
    };

    return respond(200, summary);
  } catch (err) {
    console.error('analytics-summary error:', err);
    return respond(500, { error: 'Failed to load dashboard summary' });
  }
};
