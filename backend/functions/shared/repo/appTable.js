const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
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
 * Reserve a slug atomically while putting/updating a page item.
 * @param {{ pageItem: object, slug: string, previousSlug?: string }} args
 */
async function reserveSlugAndPutPage({ pageItem, slug, previousSlug }) {
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
  await dynamo.send(new TransactWriteCommand({ TransactItems: items }));
}

async function deletePage({ userId, pageId, slug }) {
  const items = [
    { Delete: { TableName: TABLE(), Key: keys.userPage(userId, pageId) } },
    { Delete: { TableName: TABLE(), Key: keys.slug(slug) } },
  ];
  await dynamo.send(new TransactWriteCommand({ TransactItems: items }));
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
  reserveSlugAndPutPage,
  deletePage,
};
