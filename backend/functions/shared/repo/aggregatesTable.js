/**
 * Read helpers for the AggregatesTable.
 *
 * Schema (see template.yaml for the table definition):
 *   pk = QR#{qrId}  or  LINK#{qrId}#{linkKey}
 *   sk = DT#{YYYY-MM-DD}                    — daily total for that partition
 *   sk = DC#{YYYY-MM-DD}#{country}          — per-country daily count
 *   sk = DD#{YYYY-MM-DD}#{deviceType}       — per-device daily count
 *
 * Aggregator writes (UpdateItem with `ADD count :one`) live in
 * `backend/functions/aggregator.js`. Analytics handlers call the three query
 * helpers below to materialise the response payload instead of scanning raw
 * events on each request.
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = () => process.env.AGGREGATES_TABLE_NAME;

// Aggregates are tiny — keep them around longer than raw events so trailing
// dashboards remain meaningful even after EventsTable TTL has swept items.
const AGGREGATE_TTL_SECONDS = 5 * 365 * 24 * 3600;

/** Returns a list of { date, count } sorted ascending by date. */
async function queryDailyTotals({ pk, from, to, limit = 5000 }) {
  if (!pk || !from || !to) return [];
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':from': `DT#${from}`,
      ':to': `DT#${to}`,
    },
    Limit: limit,
  }));
  const rows = (res.Items ?? []).map((item) => ({
    date: typeof item.sk === 'string' ? item.sk.slice(3) : '',
    count: Number(item.count ?? 0),
  })).filter((r) => r.date);
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

/** Returns a list of { country, count } aggregated across the window, sorted by count desc then country asc. */
async function queryCountryBreakdown({ pk, from, to, limit = 5000 }) {
  if (!pk || !from || !to) return [];
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': pk,
      // BETWEEN on the lexicographic range DC#{from}# .. DC#{to}#~ captures every
      // DC#{date}#{country} sk between the two dates inclusive. '~' is the last
      // printable ASCII char we expect in a country code bucket.
      ':from': `DC#${from}#`,
      ':to': `DC#${to}#\uFFFF`,
    },
    Limit: limit,
  }));
  const totals = new Map();
  for (const item of res.Items ?? []) {
    const sk = typeof item.sk === 'string' ? item.sk : '';
    // sk = DC#{date}#{country}. Country is everything after the second '#'.
    const firstHash = sk.indexOf('#');
    if (firstHash < 0) continue;
    const secondHash = sk.indexOf('#', firstHash + 1);
    if (secondHash < 0) continue;
    const country = sk.slice(secondHash + 1);
    if (!country) continue;
    totals.set(country, (totals.get(country) ?? 0) + Number(item.count ?? 0));
  }
  return [...totals.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

/** Returns a list of { deviceType, count } aggregated across the window, sorted by count desc then deviceType asc. */
async function queryDeviceBreakdown({ pk, from, to, limit = 5000 }) {
  if (!pk || !from || !to) return [];
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':from': `DD#${from}#`,
      ':to': `DD#${to}#\uFFFF`,
    },
    Limit: limit,
  }));
  const totals = new Map();
  for (const item of res.Items ?? []) {
    const sk = typeof item.sk === 'string' ? item.sk : '';
    const firstHash = sk.indexOf('#');
    if (firstHash < 0) continue;
    const secondHash = sk.indexOf('#', firstHash + 1);
    if (secondHash < 0) continue;
    const deviceType = sk.slice(secondHash + 1);
    if (!deviceType) continue;
    totals.set(deviceType, (totals.get(deviceType) ?? 0) + Number(item.count ?? 0));
  }
  return [...totals.entries()]
    .map(([deviceType, count]) => ({ deviceType, count }))
    .sort((a, b) => b.count - a.count || a.deviceType.localeCompare(b.deviceType));
}

module.exports = {
  queryDailyTotals,
  queryCountryBreakdown,
  queryDeviceBreakdown,
  AGGREGATE_TTL_SECONDS,
};
