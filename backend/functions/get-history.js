const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { respond } = require('./shared/cors');

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const PRESIGN_TTL_SECONDS = 3600;

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  const bucket = process.env.STORAGE_BUCKET_NAME;
  const table = process.env.HISTORY_TABLE_NAME;

  try {
    const result = await dynamo.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
      Limit: 50,
    }));

    const items = await Promise.all(result.Items.map(async (item) => {
      const qrCodeUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: item.qrCodeKey }), { expiresIn: PRESIGN_TTL_SECONDS });
      const imageUrl = item.imageKey
        ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: item.imageKey }), { expiresIn: PRESIGN_TTL_SECONDS })
        : null;

      return { id: item.id, url: item.url, createdAt: item.createdAt, qrCodeUrl, imageUrl };
    }));

    return respond(200, { items });
  } catch (err) {
    console.error('Get history error:', err);
    return respond(500, { error: 'Failed to retrieve history' });
  }
};
