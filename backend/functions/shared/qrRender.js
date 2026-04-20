const QRCode = require('qrcode');
const Jimp = require('jimp');

const QR_SIZE = 500;
const LOGO_RATIO = 0.25;
const BORDER_WIDTH = 12;
const MAX_ASPECT_RATIO = 1.5;

/**
 * Error type thrown when a logo image fails dimension/aspect-ratio validation.
 * Callers should map this to an HTTP 400.
 */
class QrRenderValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QrRenderValidationError';
  }
}

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

/**
 * Render a QR code PNG. When a logoBuffer is supplied, a circular logo disk is
 * centered on top of the QR. Throws QrRenderValidationError for caller-fixable
 * input issues (too-small or too-extreme-aspect logos).
 *
 * @param {{ url: string, logoBuffer?: Buffer }} args
 * @returns {Promise<Buffer>} PNG bytes
 */
async function renderQrPng({ url, logoBuffer }) {
  if (!url || typeof url !== 'string') {
    throw new QrRenderValidationError('"url" is required to render a QR code');
  }

  const qrBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    width: QR_SIZE,
    margin: 1,
  });

  if (!logoBuffer) {
    return qrBuffer;
  }

  const qrImage = await Jimp.read(qrBuffer);
  const logo = await Jimp.read(logoBuffer);

  const w = logo.getWidth();
  const h = logo.getHeight();
  const aspectRatio = Math.max(w, h) / Math.min(w, h);

  if (aspectRatio > MAX_ASPECT_RATIO) {
    throw new QrRenderValidationError(
      `Image aspect ratio is too extreme (${w}x${h}, ratio ${aspectRatio.toFixed(2)}:1). Use an image closer to square (max ${MAX_ASPECT_RATIO}:1 ratio).`
    );
  }

  const logoSize = Math.floor(QR_SIZE * LOGO_RATIO);
  const side = Math.min(w, h);

  if (side < logoSize) {
    throw new QrRenderValidationError(
      `Image is too small. The logo circle is ${logoSize}x${logoSize}px — your image's smallest dimension is ${side}px. Provide an image that is at least ${logoSize}x${logoSize}px.`
    );
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

  return qrImage.getBufferAsync(Jimp.MIME_PNG);
}

module.exports = {
  renderQrPng,
  QrRenderValidationError,
  QR_SIZE,
  LOGO_RATIO,
  BORDER_WIDTH,
  MAX_ASPECT_RATIO,
};
