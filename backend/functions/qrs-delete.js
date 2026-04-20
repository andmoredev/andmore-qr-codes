const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { respond } = require('./shared/cors');
const { getQrByUser, keys } = require('./shared/repo/appTable');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * DELETE /qrs/{qrId} — soft delete. Sets enabled=false and records deletedAt
 * on both the owner entity and the qrId lookup. Versions are retained; restore
 * re-enables the QR.
 */
exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const qrId = event.pathParameters?.qrId;
  if (!qrId) return respond(400, { error: '"qrId" path parameter is required' });

  try {
    const existing = await getQrByUser(userId, qrId);
    if (!existing) return respond(404, { error: 'QR code not found' });

    const now = new Date().toISOString();
    const table = process.env.APP_TABLE_NAME;

    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: table,
            Key: keys.userQr(userId, qrId),
            UpdateExpression: 'SET enabled = :false, deletedAt = :now, updatedAt = :now',
            ExpressionAttributeValues: { ':false': false, ':now': now },
          },
        },
        {
          Update: {
            TableName: table,
            Key: keys.qrLookup(qrId),
            UpdateExpression: 'SET enabled = :false, deletedAt = :now, updatedAt = :now',
            ExpressionAttributeValues: { ':false': false, ':now': now },
          },
        },
      ],
    }));

    return respond(204, {});
  } catch (err) {
    console.error('qrs-delete error:', err);
    return respond(500, { error: 'Failed to delete QR code' });
  }
};
