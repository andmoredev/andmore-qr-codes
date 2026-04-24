import QRCode from 'qrcode';
import type { QrStyle } from '../types';

const QUIET_ZONE = 2;
const LOGO_RATIO = 0.25;
const LOGO_BORDER_RATIO = 10 / 220;

type BitMatrix = { size: number; get(row: number, col: number): boolean };

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function renderFluid(
  ctx: CanvasRenderingContext2D,
  modules: BitMatrix,
  moduleSize: number,
  offsetX: number,
  offsetY: number,
) {
  const { size } = modules;
  const cr = moduleSize * 0.40;

  const dark = (r: number, c: number) =>
    r >= 0 && r < size && c >= 0 && c < size && modules.get(r, c);

  const circle = (cx: number, cy: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c)) continue;
      const x = offsetX + (c + QUIET_ZONE) * moduleSize;
      const y = offsetY + (r + QUIET_ZONE) * moduleSize;

      ctx.fillStyle = 'black';
      ctx.fillRect(x, y, moduleSize, moduleSize);

      const T = dark(r - 1, c), R = dark(r, c + 1);
      const B = dark(r + 1, c), L = dark(r, c - 1);

      if (!T && !L) circle(x, y, 'white');
      if (!T && !R) circle(x + moduleSize, y, 'white');
      if (!B && !L) circle(x, y + moduleSize, 'white');
      if (!B && !R) circle(x + moduleSize, y + moduleSize, 'white');
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c)) continue;
      const x = offsetX + (c + QUIET_ZONE) * moduleSize;
      const y = offsetY + (r + QUIET_ZONE) * moduleSize;

      if (dark(r, c + 1) && dark(r + 1, c) && !dark(r + 1, c + 1))
        circle(x + moduleSize, y + moduleSize, 'black');
      if (dark(r, c - 1) && dark(r + 1, c) && !dark(r + 1, c - 1))
        circle(x, y + moduleSize, 'black');
      if (dark(r, c + 1) && dark(r - 1, c) && !dark(r - 1, c + 1))
        circle(x + moduleSize, y, 'black');
      if (dark(r, c - 1) && dark(r - 1, c) && !dark(r - 1, c - 1))
        circle(x, y, 'black');
    }
  }
}

export interface RenderQrOptions {
  url: string;
  style: QrStyle;
  logoUrl?: string | null;
  size: number;
}

export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  opts: RenderQrOptions,
  signal?: { cancelled: boolean },
): Promise<void> {
  const { url, style, logoUrl, size } = opts;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, size, size);

  if (!url) {
    ctx.fillStyle = '#334155';
    const s = Math.max(4, Math.floor(size * 0.036));
    const gap = Math.max(2, Math.floor(s * 0.5));
    const startX = Math.floor(size * 0.11);
    const startY = startX;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        ctx.fillRect(startX + c * (s + gap), startY + r * (s + gap), s, s);
      }
    }
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qr = QRCode.create(url, { errorCorrectionLevel: 'H' }) as any;
    const modules = qr.modules as BitMatrix;
    const gridSize = modules.size;
    const totalModules = gridSize + QUIET_ZONE * 2;
    const moduleSize = Math.floor(size / totalModules);
    const actualSize = moduleSize * totalModules;
    const offsetX = Math.floor((size - actualSize) / 2);
    const offsetY = offsetX;

    if (signal?.cancelled) return;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);

    if (style === 'fluid') {
      renderFluid(ctx, modules, moduleSize, offsetX, offsetY);
    } else {
      ctx.fillStyle = 'black';
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (!modules.get(r, c)) continue;
          const x = offsetX + (c + QUIET_ZONE) * moduleSize;
          const y = offsetY + (r + QUIET_ZONE) * moduleSize;
          if (style === 'dots') {
            ctx.beginPath();
            ctx.arc(x + moduleSize / 2, y + moduleSize / 2, moduleSize * 0.42, 0, Math.PI * 2);
            ctx.fill();
          } else if (style === 'rounded') {
            drawRoundedRect(ctx, x, y, moduleSize, moduleSize, moduleSize * 0.28);
          } else {
            ctx.fillRect(x, y, moduleSize, moduleSize);
          }
        }
      }
    }

    if (logoUrl && !signal?.cancelled) {
      const logoSize = Math.floor(size * LOGO_RATIO);
      const logoBorder = Math.max(4, Math.floor(size * LOGO_BORDER_RATIO));
      const circleSize = logoSize + logoBorder * 2;
      const cx = size / 2;
      const cy = size / 2;

      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(cx, cy, circleSize / 2, 0, Math.PI * 2);
      ctx.fill();

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = logoUrl;
      });

      if (!signal?.cancelled) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, logoSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
        ctx.restore();
      }
    }
  } catch {
    // silently ignore render errors (invalid URL etc.)
  }
}
