const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
      const qrCodeUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: item.qrCodeKey }), { expiresIn: 3600 });
      const imageUrl = item.imageKey
        ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: item.imageKey }), { expiresIn: 3600 })
        : null;

      return { id: item.id, url: item.url, createdAt: item.createdAt, qrCodeUrl, imageUrl };
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    };
  } catch (err) {
    console.error('Get history error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to retrieve history' }) };
  }
};
