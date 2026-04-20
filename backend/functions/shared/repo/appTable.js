const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = () => process.env.APP_TABLE_NAME;

const keys = {
  userQr: (userId, qrId) => ({ pk: `USER#${userId}`, sk: `QR#${qrId}` }),
  qrLookup: (qrId) => ({ pk: `QR#${qrId}`, sk: 'META' }),
  qrVersion: (qrId, n) => ({ pk: `QR#${qrId}`, sk: `V#${String(n).padStart(6, '0')}` }),
  userPage: (userId, pageId) => ({ pk: `USER#${userId}`, sk: `PAGE#${pageId}` }),
  pageVersion: (pageId, n) => ({ pk: `PAGE#${pageId}`, sk: `V#${String(n).padStart(6, '0')}` }),
  slug: (slug) => ({ pk: `SLUG#${slug}`, sk: 'META' }),
};

async function getByKey(key) {
  const res = await dynamo.send(new GetCommand({ TableName: TABLE(), Key: key }));
  return res.Item ?? null;
}

async function putItem(item) {
  await dynamo.send(new PutCommand({ TableName: TABLE(), Item: item }));
}

async function getQrByUser(userId, qrId) {
  return getByKey(keys.userQr(userId, qrId));
}

async function getQrLookup(qrId) {
  return getByKey(keys.qrLookup(qrId));
}

async function listUserQrs(userId, limit = 100) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'QR#' },
    Limit: limit,
  }));
  return res.Items ?? [];
}

async function listQrVersions(qrId, limit = 50) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `QR#${qrId}`, ':prefix': 'V#' },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return res.Items ?? [];
}

async function getPageByUser(userId, pageId) {
  return getByKey(keys.userPage(userId, pageId));
}

async function getPageBySlug(slug) {
  const reservation = await getByKey(keys.slug(slug));
  if (!reservation) return null;
  return getByKey(keys.userPage(reservation.userId, reservation.pageId));
}

async function listUserPages(userId, limit = 100) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'PAGE#' },
    Limit: limit,
  }));
  return res.Items ?? [];
}

async function listPageVersions(pageId, limit = 50) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `PAGE#${pageId}`, ':prefix': 'V#' },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return res.Items ?? [];
}

/**
 * Reserve a slug atomically while putting/updating a page item, and
 * optionally append a version snapshot in the same transaction.
 *
 * Transaction order (item index in cancellation reasons):
 *   0: delete previous slug reservation (only when slug changes)
 *   next: put (or reuse) new slug reservation
 *   next: put page item
 *   next: put version snapshot (optional)
 *
 * On conflict (slug already taken), the TransactionCanceledException's
 * CancellationReasons will include `Code: 'ConditionalCheckFailed'` on
 * the slug-reservation Put item. Callers can detect this with
 * `isSlugConflict(err)` and return 409.
 *
 * @param {{
 *   pageItem: object,
 *   slug: string,
 *   previousSlug?: string,
 *   versionItem?: object
 * }} args
 */
async function reserveSlugAndPutPage({ pageItem, slug, previousSlug, versionItem }) {
  const items = [];
  if (previousSlug && previousSlug !== slug) {
    items.push({ Delete: { TableName: TABLE(), Key: keys.slug(previousSlug) } });
  }
  items.push({
    Put: {
      TableName: TABLE(),
      Item: { ...keys.slug(slug), slug, pageId: pageItem.pageId, userId: pageItem.userId },
      ConditionExpression: 'attribute_not_exists(pk) OR pageId = :pageId',
      ExpressionAttributeValues: { ':pageId': pageItem.pageId },
    },
  });
  items.push({
    Put: {
      TableName: TABLE(),
      Item: { ...keys.userPage(pageItem.userId, pageItem.pageId), ...pageItem },
    },
  });
  if (versionItem) {
    items.push({
      Put: {
        TableName: TABLE(),
        Item: versionItem,
      },
    });
  }
  await dynamo.send(new TransactWriteCommand({ TransactItems: items }));
}

/**
 * Update a page item and append a version snapshot in a single transaction.
 * Does NOT touch the slug reservation — use when the slug is unchanged.
 *
 * @param {{ pageItem: object, versionItem: object }} args
 */
async function updatePageWithVersion({ pageItem, versionItem }) {
  await dynamo.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE(),
          Item: { ...keys.userPage(pageItem.userId, pageItem.pageId), ...pageItem },
        },
      },
      {
        Put: {
          TableName: TABLE(),
          Item: versionItem,
        },
      },
    ],
  }));
}

/**
 * Detect a slug-conflict error from reserveSlugAndPutPage.
 *
 * The slug-reservation Put is always present and sits at index 0 (no prior
 * slug) or index 1 (delete previous slug + put new). A ConditionalCheckFailed
 * on either of those means the slug is taken by another page.
 *
 * Any other cancellation reason is treated as a 500 by callers.
 */
function isSlugConflict(err) {
  if (!err || err.name !== 'TransactionCanceledException') return false;
  const reasons = err.CancellationReasons ?? [];
  // The slug Put is the first non-Delete item, so check indices 0 and 1.
  for (let i = 0; i < Math.min(reasons.length, 2); i++) {
    if (reasons[i]?.Code === 'ConditionalCheckFailed') return true;
  }
  return false;
}

/**
 * Hard-delete a page: remove the slug reservation, the user→page pointer,
 * and all version snapshots. Transactions cap at 100 items, so versions
 * are removed via BatchWriteItem in chunks of 25 after the primary tx.
 *
 * @param {{ userId: string, pageId: string, slug: string }} args
 */
async function deletePage({ userId, pageId, slug }) {
  await dynamo.send(new TransactWriteCommand({
    TransactItems: [
      { Delete: { TableName: TABLE(), Key: keys.userPage(userId, pageId) } },
      { Delete: { TableName: TABLE(), Key: keys.slug(slug) } },
    ],
  }));

  // Drain every version snapshot in 25-item chunks.
  let lastKey;
  do {
    const res = await dynamo.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': `PAGE#${pageId}`, ':prefix': 'V#' },
      ExclusiveStartKey: lastKey,
      ProjectionExpression: 'pk, sk',
    }));
    const items = res.Items ?? [];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await dynamo.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE()]: chunk.map((it) => ({ DeleteRequest: { Key: { pk: it.pk, sk: it.sk } } })),
        },
      }));
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
}

async function getPageVersion(pageId, n) {
  return getByKey(keys.pageVersion(pageId, n));
}

module.exports = {
  keys,
  getByKey,
  putItem,
  getQrByUser,
  getQrLookup,
  listUserQrs,
  listQrVersions,
  getPageByUser,
  getPageBySlug,
  listUserPages,
  listPageVersions,
  getPageVersion,
  reserveSlugAndPutPage,
  updatePageWithVersion,
  isSlugConflict,
  deletePage,
};
