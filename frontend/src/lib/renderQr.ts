import QRCode from 'qrcode';
import type { QrStyle } from '../types';

const QUIET_ZONE = 2;
const LOGO_RATIO = 0.25;
const LOGO_BORDER_RATIO = 10 / 220;

type BitMatrix = { size: number; get(row: number, col: number): boolean };

export interface QrRenderOptions {
  url: string;
  style: QrStyle;
  logoUrl?: string | null;
  size: number;
  transparent?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// Canvas renderer
// ────────────────────────────────────────────────────────────────────

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

function renderFluidToCanvas(
  ctx: CanvasRenderingContext2D,
  modules: BitMatrix,
  moduleSize: number,
  offsetX: number,
  offsetY: number,
  transparent: boolean,
) {
  const { size } = modules;
  const cr = moduleSize * 0.40;

  const dark = (r: number, c: number) =>
    r >= 0 && r < size && c >= 0 && c < size && modules.get(r, c);

  const circle = (cx: number, cy: number, fillStyle: string | null) => {
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    if (fillStyle === null) {
      // erase pixels (transparent cut)
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
      ctx.globalCompositeOperation = prev;
    } else {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
  };

  // Pass 1: black cells + concave exterior corners
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c)) continue;
      const x = offsetX + (c + QUIET_ZONE) * moduleSize;
      const y = offsetY + (r + QUIET_ZONE) * moduleSize;

      ctx.fillStyle = 'black';
      ctx.fillRect(x, y, moduleSize, moduleSize);

      const T = dark(r - 1, c), R = dark(r, c + 1);
      const B = dark(r + 1, c), L = dark(r, c - 1);

      const cornerFill = transparent ? null : 'white';
      if (!T && !L) circle(x, y, cornerFill);
      if (!T && !R) circle(x + moduleSize, y, cornerFill);
      if (!B && !L) circle(x, y + moduleSize, cornerFill);
      if (!B && !R) circle(x + moduleSize, y + moduleSize, cornerFill);
    }
  }

  // Pass 2: convex black bridges at T-junctions
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

export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  opts: QrRenderOptions & { dpr?: number },
  signal?: { cancelled: boolean },
): Promise<void> {
  const { url, style, logoUrl, size, transparent = false } = opts;
  const dpr = opts.dpr ?? (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

  canvas.width = size * dpr;
  canvas.height = size * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (transparent) {
    ctx.clearRect(0, 0, size, size);
  } else {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
  }

  if (!url) {
    if (!transparent) {
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

    if (style === 'fluid') {
      renderFluidToCanvas(ctx, modules, moduleSize, offsetX, offsetY, transparent);
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

      // Keep the white disc even in transparent mode — scanners rely on the quiet zone around the logo.
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

// ────────────────────────────────────────────────────────────────────
// SVG renderer
// ────────────────────────────────────────────────────────────────────

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function svgRectsForStyle(
  modules: BitMatrix,
  moduleSize: number,
  offsetX: number,
  offsetY: number,
  style: QrStyle,
): string {
  const { size } = modules;
  const shapes: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules.get(r, c)) continue;
      const x = offsetX + (c + QUIET_ZONE) * moduleSize;
      const y = offsetY + (r + QUIET_ZONE) * moduleSize;

      if (style === 'dots') {
        shapes.push(
          `<circle cx="${x + moduleSize / 2}" cy="${y + moduleSize / 2}" r="${moduleSize * 0.42}"/>`,
        );
      } else if (style === 'rounded') {
        const rr = moduleSize * 0.28;
        shapes.push(
          `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" rx="${rr}" ry="${rr}"/>`,
        );
      } else {
        // 'square' — also used as the raw cells for 'fluid' (masked below)
        shapes.push(
          `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}"/>`,
        );
      }
    }
  }
  return shapes.join('');
}

function svgForFluid(
  modules: BitMatrix,
  moduleSize: number,
  offsetX: number,
  offsetY: number,
  maskId: string,
  canvasSize: number,
): { mask: string; masked: string; bridges: string } {
  const { size } = modules;
  const cr = moduleSize * 0.40;
  const dark = (r: number, c: number) =>
    r >= 0 && r < size && c >= 0 && c < size && modules.get(r, c);

  const rectParts: string[] = [];
  const cornerPunches: string[] = [];
  const bridges: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c)) continue;
      const x = offsetX + (c + QUIET_ZONE) * moduleSize;
      const y = offsetY + (r + QUIET_ZONE) * moduleSize;
      rectParts.push(`<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}"/>`);

      const T = dark(r - 1, c), R = dark(r, c + 1);
      const B = dark(r + 1, c), L = dark(r, c - 1);

      if (!T && !L) cornerPunches.push(`<circle cx="${x}" cy="${y}" r="${cr}" fill="black"/>`);
      if (!T && !R) cornerPunches.push(`<circle cx="${x + moduleSize}" cy="${y}" r="${cr}" fill="black"/>`);
      if (!B && !L) cornerPunches.push(`<circle cx="${x}" cy="${y + moduleSize}" r="${cr}" fill="black"/>`);
      if (!B && !R) cornerPunches.push(`<circle cx="${x + moduleSize}" cy="${y + moduleSize}" r="${cr}" fill="black"/>`);

      if (dark(r, c + 1) && dark(r + 1, c) && !dark(r + 1, c + 1))
        bridges.push(`<circle cx="${x + moduleSize}" cy="${y + moduleSize}" r="${cr}"/>`);
      if (dark(r, c - 1) && dark(r + 1, c) && !dark(r + 1, c - 1))
        bridges.push(`<circle cx="${x}" cy="${y + moduleSize}" r="${cr}"/>`);
      if (dark(r, c + 1) && dark(r - 1, c) && !dark(r - 1, c + 1))
        bridges.push(`<circle cx="${x + moduleSize}" cy="${y}" r="${cr}"/>`);
      if (dark(r, c - 1) && dark(r - 1, c) && !dark(r - 1, c - 1))
        bridges.push(`<circle cx="${x}" cy="${y}" r="${cr}"/>`);
    }
  }

  // Mask: white = keep, black = cut. Start white, punch exterior corners black.
  const mask = `<mask id="${maskId}">
    <rect x="0" y="0" width="${canvasSize}" height="${canvasSize}" fill="white"/>
    ${cornerPunches.join('')}
  </mask>`;

  const masked = `<g mask="url(#${maskId})" fill="black">${rectParts.join('')}</g>`;
  const bridgesSvg = `<g fill="black">${bridges.join('')}</g>`;

  return { mask, masked, bridges: bridgesSvg };
}

export async function renderQrToSvg(opts: QrRenderOptions): Promise<string> {
  const { url, style, logoUrl, size, transparent = false } = opts;

  if (!url) {
    const bg = transparent ? '' : `<rect width="${size}" height="${size}" fill="white"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${bg}</svg>`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' }) as any;
  const modules = qr.modules as BitMatrix;
  const gridSize = modules.size;
  const totalModules = gridSize + QUIET_ZONE * 2;
  const moduleSize = size / totalModules; // float in SVG is fine
  const actualSize = moduleSize * totalModules;
  const offsetX = (size - actualSize) / 2;
  const offsetY = offsetX;

  const bg = transparent ? '' : `<rect width="${size}" height="${size}" fill="white"/>`;

  let modulesSvg = '';
  if (style === 'fluid') {
    const { mask, masked, bridges } = svgForFluid(modules, moduleSize, offsetX, offsetY, 'fluidMask', size);
    modulesSvg = `<defs>${mask}</defs>${masked}${bridges}`;
  } else {
    modulesSvg = `<g fill="black">${svgRectsForStyle(modules, moduleSize, offsetX, offsetY, style)}</g>`;
  }

  let logoSvg = '';
  if (logoUrl) {
    const logoSize = size * LOGO_RATIO;
    const logoBorder = Math.max(4, size * LOGO_BORDER_RATIO);
    const circleSize = logoSize + logoBorder * 2;
    const cx = size / 2;
    const cy = size / 2;
    const dataUrl = await fetchAsDataUrl(logoUrl);
    const clipId = 'logoClip';
    logoSvg = `
      <circle cx="${cx}" cy="${cy}" r="${circleSize / 2}" fill="white"/>
      ${dataUrl ? `
        <defs>
          <clipPath id="${clipId}">
            <circle cx="${cx}" cy="${cy}" r="${logoSize / 2}"/>
          </clipPath>
        </defs>
        <image href="${dataUrl}" x="${cx - logoSize / 2}" y="${cy - logoSize / 2}" width="${logoSize}" height="${logoSize}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>
      ` : ''}
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${bg}${modulesSvg}${logoSvg}</svg>`;
}

// ────────────────────────────────────────────────────────────────────
// Download helpers
// ────────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportQrPng(
  opts: QrRenderOptions,
  filename: string,
): Promise<void> {
  const canvas = document.createElement('canvas');
  await renderQrToCanvas(canvas, { ...opts, dpr: 1 });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) throw new Error('PNG export failed');
  triggerDownload(blob, filename);
}

export async function exportQrSvg(
  opts: QrRenderOptions,
  filename: string,
): Promise<void> {
  const svg = await renderQrToSvg(opts);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}
