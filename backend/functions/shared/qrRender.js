const QRCode = require('qrcode');
const Jimp = require('jimp');

const QR_SIZE = 500;
const QUIET_ZONE = 2;
const LOGO_RATIO = 0.25;
const BORDER_WIDTH = 12;
const MAX_ASPECT_RATIO = 1.5;

const VALID_STYLES = ['square', 'rounded', 'dots', 'fluid'];

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

/**
 * Paint a filled circle of `color` (0 = black, 255 = white) at pixel (cx, cy).
 * Used by the fluid renderer for corner cuts and concave fills.
 */
function paintCircle(image, cx, cy, r, color) {
  const W = image.getWidth();
  const H = image.getHeight();
  const x0 = Math.max(0, cx - r);
  const y0 = Math.max(0, cy - r);
  const w = Math.min(W, cx + r + 1) - x0;
  const h = Math.min(H, cy + r + 1) - y0;
  if (w <= 0 || h <= 0) return;
  image.scan(x0, y0, w, h, function (px, py, idx) {
    const dx = px - cx;
    const dy = py - cy;
    if (dx * dx + dy * dy < r * r) {
      this.bitmap.data[idx] = color;
      this.bitmap.data[idx + 1] = color;
      this.bitmap.data[idx + 2] = color;
      this.bitmap.data[idx + 3] = 255;
    }
  });
}

/**
 * Fluid style: fill every dark module as a solid square, then:
 *   1. Cut outer corners (white quarter-circle) where both edge-adjacent
 *      neighbors in that corner direction are absent.
 *   2. Fill inner concave junctions (black quarter-circle) where two
 *      edge-adjacent neighbors are present but the diagonal is absent —
 *      this smooths the concavity in the white space.
 */
function renderFluid(image, qr, moduleSize, offsetX, offsetY) {
  const sz = moduleSize;
  const cr = Math.round(sz * 0.40);
  const { size } = qr.modules;

  function dark(r, c) {
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    return qr.modules.get(r, c);
  }

  // Pass 1: fill squares + cut outer corners
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c)) continue;
      const x = offsetX + (c + QUIET_ZONE) * sz;
      const y = offsetY + (r + QUIET_ZONE) * sz;

      drawSquare(image, x, y, sz);

      const T = dark(r - 1, c);
      const R = dark(r, c + 1);
      const B = dark(r + 1, c);
      const L = dark(r, c - 1);

      if (!T && !L) paintCircle(image, x,      y,      cr, 255);
      if (!T && !R) paintCircle(image, x + sz, y,      cr, 255);
      if (!B && !L) paintCircle(image, x,      y + sz, cr, 255);
      if (!B && !R) paintCircle(image, x + sz, y + sz, cr, 255);
    }
  }

  // Pass 2: fill inner concave junctions
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c)) continue;
      const x = offsetX + (c + QUIET_ZONE) * sz;
      const y = offsetY + (r + QUIET_ZONE) * sz;

      if (dark(r, c + 1) && dark(r + 1, c) && !dark(r + 1, c + 1))
        paintCircle(image, x + sz, y + sz, cr, 0);
      if (dark(r, c - 1) && dark(r + 1, c) && !dark(r + 1, c - 1))
        paintCircle(image, x,      y + sz, cr, 0);
      if (dark(r, c + 1) && dark(r - 1, c) && !dark(r - 1, c + 1))
        paintCircle(image, x + sz, y,      cr, 0);
      if (dark(r, c - 1) && dark(r - 1, c) && !dark(r - 1, c - 1))
        paintCircle(image, x,      y,      cr, 0);
    }
  }
}

function renderModules(image, qr, moduleSize, offsetX, offsetY, style) {
  if (style === 'fluid') {
    renderFluid(image, qr, moduleSize, offsetX, offsetY);
    return;
  }
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
  // Render fluid at 2x then downscale — Jimp's pixel ops have no anti-aliasing,
  // so supersampling is the only way to get smooth curves.
  const scale = style === 'fluid' ? 2 : 1;
  const renderSize = QR_SIZE * scale;
  const totalModules = size + QUIET_ZONE * 2;
  const moduleSize = Math.floor(renderSize / totalModules);
  const actualSize = moduleSize * totalModules;
  const offsetX = Math.floor((renderSize - actualSize) / 2);
  const offsetY = offsetX;

  const image = new Jimp(renderSize, renderSize, 0xffffffff);
  renderModules(image, qr, moduleSize, offsetX, offsetY, style);

  if (scale > 1) {
    image.resize(QR_SIZE, QR_SIZE);
  }

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
