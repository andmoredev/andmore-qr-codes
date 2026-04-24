const QRCode = require('qrcode');
const Jimp = require('jimp');

const QR_SIZE = 500;
const QUIET_ZONE = 4;
const LOGO_RATIO = 0.25;
const BORDER_WIDTH = 12;
const MAX_ASPECT_RATIO = 1.5;

const VALID_STYLES = ['square', 'rounded', 'dots'];

class QrRenderValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QrRenderValidationError';
  }
}

function setBlack(data, idx) {
  data[idx] = 0;
  data[idx + 1] = 0;
  data[idx + 2] = 0;
  data[idx + 3] = 255;
}

function drawSquare(image, x, y, sz) {
  image.scan(x, y, sz, sz, function (_, __, idx) {
    setBlack(this.bitmap.data, idx);
  });
}

function drawRounded(image, x, y, sz, radius) {
  const hw = sz / 2;
  const cx = x + hw;
  const cy = y + hw;
  const irx = hw - radius;
  const iry = hw - radius;
  image.scan(x, y, sz, sz, function (px, py, idx) {
    const dx = Math.abs(px - cx);
    const dy = Math.abs(py - cy);
    let inside;
    if (dx <= irx) {
      inside = dy <= hw;
    } else if (dy <= iry) {
      inside = dx <= hw;
    } else {
      const ox = dx - irx;
      const oy = dy - iry;
      inside = ox * ox + oy * oy <= radius * radius;
    }
    if (inside) setBlack(this.bitmap.data, idx);
  });
}

function drawDot(image, x, y, sz) {
  const r = sz * 0.42;
  const cx = x + sz / 2;
  const cy = y + sz / 2;
  image.scan(x, y, sz, sz, function (px, py, idx) {
    const dx = px - cx;
    const dy = py - cy;
    if (dx * dx + dy * dy <= r * r) {
      setBlack(this.bitmap.data, idx);
    }
  });
}

function renderModules(image, qr, moduleSize, offsetX, offsetY, style) {
  const { size } = qr.modules;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!qr.modules.get(r, c)) continue;
      const x = offsetX + (c + QUIET_ZONE) * moduleSize;
      const y = offsetY + (r + QUIET_ZONE) * moduleSize;
      if (style === 'dots') {
        drawDot(image, x, y, moduleSize);
      } else if (style === 'rounded') {
        drawRounded(image, x, y, moduleSize, moduleSize * 0.28);
      } else {
        drawSquare(image, x, y, moduleSize);
      }
    }
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
 * Render a QR code PNG with selectable dot style.
 *
 * @param {{ url: string, logoBuffer?: Buffer, style?: 'square'|'rounded'|'dots' }} args
 * @returns {Promise<Buffer>} PNG bytes
 */
async function renderQrPng({ url, logoBuffer, style = 'square' }) {
  if (!url || typeof url !== 'string') {
    throw new QrRenderValidationError('"url" is required to render a QR code');
  }
  if (!VALID_STYLES.includes(style)) {
    throw new QrRenderValidationError(`"style" must be one of: ${VALID_STYLES.join(', ')}`);
  }

  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const { size } = qr.modules;
  const totalModules = size + QUIET_ZONE * 2;
  const moduleSize = Math.floor(QR_SIZE / totalModules);
  const actualSize = moduleSize * totalModules;
  const offsetX = Math.floor((QR_SIZE - actualSize) / 2);
  const offsetY = offsetX;

  const image = new Jimp(QR_SIZE, QR_SIZE, 0xffffffff);
  renderModules(image, qr, moduleSize, offsetX, offsetY, style);

  if (!logoBuffer) {
    return image.getBufferAsync(Jimp.MIME_PNG);
  }

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
  const diskY = Math.floor((image.getHeight() - circleSize) / 2);
  image.composite(whiteDisk, diskX, diskY);
  image.composite(logo, diskX + BORDER_WIDTH, diskY + BORDER_WIDTH);

  return image.getBufferAsync(Jimp.MIME_PNG);
}

module.exports = {
  renderQrPng,
  QrRenderValidationError,
  QR_SIZE,
  LOGO_RATIO,
  BORDER_WIDTH,
  MAX_ASPECT_RATIO,
};
