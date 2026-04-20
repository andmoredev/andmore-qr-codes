const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { newEventId } = require('../ids');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = () => process.env.EVENTS_TABLE_NAME;

const scanKey = (qrId, ts, eventId) => ({ pk: `QR#${qrId}`, sk: `S#${ts}#${eventId}` });
const clickKey = (qrId, linkKey, ts, eventId) => ({ pk: `LINK#${qrId}#${linkKey}`, sk: `C#${ts}#${eventId}` });

async function putScanEvent({ qrId, country, deviceType, referrer, uaHash, ipHash }) {
  const ts = new Date().toISOString();
  const eventId = newEventId();
  await dynamo.send(new PutCommand({
    TableName: TABLE(),
    Item: { ...scanKey(qrId, ts, eventId), qrId, eventId, ts, country, deviceType, referrer, uaHash, ipHash },
  }));
  return { eventId, ts };
}

async function putClickEvent({ qrId, linkKey, country, deviceType, referrer, uaHash, ipHash }) {
  const ts = new Date().toISOString();
  const eventId = newEventId();
  await dynamo.send(new PutCommand({
    TableName: TABLE(),
    Item: { ...clickKey(qrId, linkKey, ts, eventId), qrId, linkKey, eventId, ts, country, deviceType, referrer, uaHash, ipHash },
  }));
  return { eventId, ts };
}

async function queryScans({ qrId, from, to, limit = 1000 }) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': `QR#${qrId}`,
      ':from': `S#${from ?? '0000'}`,
      ':to': `S#${to ?? '9999'}`,
    },
    Limit: limit,
  }));
  return res.Items ?? [];
}

async function queryClicks({ qrId, linkKey, from, to, limit = 1000 }) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': `LINK#${qrId}#${linkKey}`,
      ':from': `C#${from ?? '0000'}`,
      ':to': `C#${to ?? '9999'}`,
    },
    Limit: limit,
  }));
  return res.Items ?? [];
}

module.exports = { putScanEvent, putClickEvent, queryScans, queryClicks };
