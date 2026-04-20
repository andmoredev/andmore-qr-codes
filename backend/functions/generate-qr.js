const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const { renderQrPng, QrRenderValidationError } = require('./shared/qrRender');
const { respond } = require('./shared/cors');

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { url, image } = body;

  if (!url) {
    return respond(400, { error: '"url" is required' });
  }

  const userId = event.requestContext?.authorizer?.claims?.sub;
  const id = randomUUID();
  const bucket = process.env.STORAGE_BUCKET_NAME;
  const table = process.env.HISTORY_TABLE_NAME;

  try {
    let logoBuffer;
    if (image) {
      try {
        logoBuffer = Buffer.from(image, 'base64');
      } catch {
        return respond(400, { error: 'Invalid base64 image data' });
      }
    }

    let outputBuffer;
    try {
      outputBuffer = await renderQrPng({ url, logoBuffer });
    } catch (err) {
      if (err instanceof QrRenderValidationError) {
        return respond(400, { error: err.message });
      }
      throw err;
    }

    let imageKey;
    if (logoBuffer) {
      imageKey = `images/${userId}/${id}.png`;
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        Body: logoBuffer,
        ContentType: 'image/png',
      }));
    }

    const qrCodeKey = `qrcodes/${userId}/${id}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: qrCodeKey,
      Body: outputBuffer,
      ContentType: 'image/png',
    }));

    await dynamo.send(new PutCommand({
      TableName: table,
      Item: {
        userId,
        createdAt: new Date().toISOString(),
        id,
        url,
        qrCodeKey,
        ...(imageKey && { imageKey }),
      },
    }));

    return respond(200, { id, qrCode: outputBuffer.toString('base64') });
  } catch (err) {
    console.error('QR generation error:', err);
    return respond(500, { error: 'Failed to generate QR code' });
  }
};
