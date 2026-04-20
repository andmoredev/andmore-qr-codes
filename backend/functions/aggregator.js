/**
 * AggregatorFunction — DynamoDB Stream consumer for EventsTable.
 *
 * For every INSERT record on EventsTable, bump three counters in
 * AggregatesTable:
 *   - DT#{date}                 — daily total for the partition
 *   - DC#{date}#{country}       — per-country daily count (only if country present)
 *   - DD#{date}#{deviceType}    — per-device daily count (defaults to 'unknown')
 *
 * Partition key is copied straight from the event's pk:
 *   - QR#{qrId}                 for scan events
 *   - LINK#{qrId}#{linkKey}     for click events
 *
 * Stream delivery is at-least-once. On retry we may double-count a given event;
 * that's an acceptable tradeoff for analytics (cheap, eventually consistent).
 * Partial-batch failures are reported back via ReportBatchItemFailures so a
 * single bad record doesn't block the whole window.
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = () => process.env.AGGREGATES_TABLE_NAME;

// Match the longer retention baked into aggregatesTable.js. Inlined here to
// avoid a cold-start require of the read helper (which pulls QueryCommand).
const AGGREGATE_TTL_SECONDS = 5 * 365 * 24 * 3600;
const CONCURRENCY = 10;

/** Tiny inline p-limit: run `mapper` over `items` N at a time. */
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

const bumpUpdate = (pk, sk) => new UpdateCommand({
  TableName: TABLE(),
  Key: { pk, sk },
  UpdateExpression: 'ADD #count :one SET #expires = if_not_exists(#expires, :expires)',
  ExpressionAttributeNames: {
    '#count': 'count',
    '#expires': 'expiresAt',
  },
  ExpressionAttributeValues: {
    ':one': 1,
    ':expires': Math.floor(Date.now() / 1000) + AGGREGATE_TTL_SECONDS,
  },
});

/** Build the UpdateItem commands for a single event item. */
function commandsFor(item) {
  const pk = typeof item.pk === 'string' ? item.pk : null;
  const ts = typeof item.ts === 'string' ? item.ts : null;
  if (!pk || !ts) return [];
  const date = ts.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const country = typeof item.country === 'string' ? item.country.trim() : '';
  const deviceType = typeof item.deviceType === 'string' && item.deviceType.trim()
    ? item.deviceType.trim()
    : 'unknown';

  const cmds = [
    bumpUpdate(pk, `DT#${date}`),
    bumpUpdate(pk, `DD#${date}#${deviceType}`),
  ];
  if (country) cmds.push(bumpUpdate(pk, `DC#${date}#${country}`));
  return cmds;
}

exports.handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  const batchItemFailures = [];

  await pMap(records, CONCURRENCY, async (record) => {
    const eventID = record?.eventID ?? null;
    try {
      if (record?.eventName !== 'INSERT') return;
      const newImage = record?.dynamodb?.NewImage;
      if (!newImage) return;

      let item;
      try {
        item = unmarshall(newImage);
      } catch (err) {
        console.error('aggregator: failed to unmarshall NewImage', { eventID, err });
        if (eventID) batchItemFailures.push({ itemIdentifier: eventID });
        return;
      }

      const cmds = commandsFor(item);
      if (cmds.length === 0) return;
      await Promise.all(cmds.map((cmd) => dynamo.send(cmd)));
    } catch (err) {
      console.error('aggregator: UpdateItem failed for record', { eventID, err });
      if (eventID) batchItemFailures.push({ itemIdentifier: eventID });
    }
  });

  return { batchItemFailures };
};
