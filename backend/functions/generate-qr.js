const { generateQrCode } = require('./qr-generator');

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { url, image } = body;

  if (!url || !image) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Both "url" and "image" (base64) are required' }),
    };
  }

  let imageBuffer;
  try {
    imageBuffer = Buffer.from(image, 'base64');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid base64 image data' }) };
  }

  try {
    const outputBuffer = await generateQrCode(url, imageBuffer);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrCode: outputBuffer.toString('base64') }),
    };
  } catch (err) {
    const isValidationError = err.message.includes('aspect ratio') || err.message.includes('too small');
    return {
      statusCode: isValidationError ? 400 : 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
