const QRCode = require('qrcode');
const Jimp = require('jimp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const QR_SIZE = 500;
const LOGO_RATIO = 0.25;
const BORDER_WIDTH = 12;
const MAX_ASPECT_RATIO = 1.5;

function applyCircularMask(image) {
  const w = image.getWidth();
  const h = image.getHeight();
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy);

  image.scan(0, 0, w, h, function (x, y, idx) {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > r * r) {
      this.bitmap.data[idx + 3] = 0;
    }
  });
}

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { url, image } = body;

  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ error: '"url" is required' }) };
  }

  const userId = event.requestContext?.authorizer?.claims?.sub;
  const id = randomUUID();
  const bucket = process.env.STORAGE_BUCKET_NAME;
  const table = process.env.HISTORY_TABLE_NAME;

  try {
    const qrBuffer = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: QR_SIZE,
      margin: 1,
    });

    let outputBuffer = qrBuffer;
    let imageKey;

    if (image) {
      let imageBuffer;
      try {
        imageBuffer = Buffer.from(image, 'base64');
      } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid base64 image data' }) };
      }

      const qrImage = await Jimp.read(qrBuffer);
      const logo = await Jimp.read(imageBuffer);

      const w = logo.getWidth();
      const h = logo.getHeight();
      const aspectRatio = Math.max(w, h) / Math.min(w, h);

      if (aspectRatio > MAX_ASPECT_RATIO) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Image aspect ratio is too extreme (${w}x${h}, ratio ${aspectRatio.toFixed(2)}:1). Use an image closer to square (max ${MAX_ASPECT_RATIO}:1 ratio).`,
          }),
        };
      }

      const logoSize = Math.floor(QR_SIZE * LOGO_RATIO);
      const side = Math.min(w, h);

      if (side < logoSize) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Image is too small. The logo circle is ${logoSize}x${logoSize}px — your image's smallest dimension is ${side}px. Provide an image that is at least ${logoSize}x${logoSize}px.`,
          }),
        };
      }

      logo.crop(Math.floor((w - side) / 2), Math.floor((h - side) / 2), side, side);
      logo.resize(logoSize, logoSize);
      applyCircularMask(logo);

      const circleSize = logoSize + BORDER_WIDTH * 2;
      const whiteDisk = new Jimp(circleSize, circleSize, 0x00000000);
      whiteDisk.scan(0, 0, circleSize, circleSize, function (x, y, idx) {
        const dx = x - circleSize / 2;
        const dy = y - circleSize / 2;
        if (dx * dx + dy * dy <= (circleSize / 2) * (circleSize / 2)) {
          this.bitmap.data[idx] = 255;
          this.bitmap.data[idx + 1] = 255;
          this.bitmap.data[idx + 2] = 255;
          this.bitmap.data[idx + 3] = 255;
        }
      });

      const diskX = Math.floor((QR_SIZE - circleSize) / 2);
      const diskY = Math.floor((qrImage.getHeight() - circleSize) / 2);
      qrImage.composite(whiteDisk, diskX, diskY);
      qrImage.composite(logo, diskX + BORDER_WIDTH, diskY + BORDER_WIDTH);

      outputBuffer = await qrImage.getBufferAsync(Jimp.MIME_PNG);

      imageKey = `images/${userId}/${id}.png`;
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        Body: imageBuffer,
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, qrCode: outputBuffer.toString('base64') }),
    };
  } catch (err) {
    console.error('QR generation error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate QR code' }) };
  }
};
