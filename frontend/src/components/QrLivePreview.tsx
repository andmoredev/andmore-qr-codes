import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import type { QrStyle } from '../types';

interface QrLivePreviewProps {
  url: string;
  style: QrStyle;
  logoUrl?: string | null;
}

const DISPLAY_SIZE = 220;
const QUIET_ZONE = 2;
const LOGO_RATIO = 0.25;
const LOGO_BORDER = 10;

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

type BitMatrix = { size: number; get(row: number, col: number): boolean };

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

export function QrLivePreview({ url, style, logoUrl }: QrLivePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // HiDPI: scale canvas buffer to device pixel ratio so arcs are crisp
    const dpr = window.devicePixelRatio || 1;
    canvas.width = DISPLAY_SIZE * dpr;
    canvas.height = DISPLAY_SIZE * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    let cancelled = false;

    async function render() {
      ctx!.fillStyle = 'white';
      ctx!.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);

      if (!url) {
        ctx!.fillStyle = '#334155';
        const s = 8;
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            ctx!.fillRect(24 + c * (s + 4), 24 + r * (s + 4), s, s);
          }
        }
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const qr = QRCode.create(url, { errorCorrectionLevel: 'H' }) as any;
        const modules = qr.modules as BitMatrix;
        const { size } = modules;
        const totalModules = size + QUIET_ZONE * 2;
        const moduleSize = Math.floor(DISPLAY_SIZE / totalModules);
        const actualSize = moduleSize * totalModules;
        const offsetX = Math.floor((DISPLAY_SIZE - actualSize) / 2);
        const offsetY = offsetX;

        if (cancelled) return;

        ctx!.fillStyle = 'white';
        ctx!.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);

        if (style === 'fluid') {
          renderFluid(ctx!, modules, moduleSize, offsetX, offsetY);
        } else {
          ctx!.fillStyle = 'black';
          for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
              if (!modules.get(r, c)) continue;
              const x = offsetX + (c + QUIET_ZONE) * moduleSize;
              const y = offsetY + (r + QUIET_ZONE) * moduleSize;
              if (style === 'dots') {
                ctx!.beginPath();
                ctx!.arc(x + moduleSize / 2, y + moduleSize / 2, moduleSize * 0.42, 0, Math.PI * 2);
                ctx!.fill();
              } else if (style === 'rounded') {
                drawRoundedRect(ctx!, x, y, moduleSize, moduleSize, moduleSize * 0.28);
              } else {
                ctx!.fillRect(x, y, moduleSize, moduleSize);
              }
            }
          }
        }

        if (logoUrl && !cancelled) {
          const logoSize = Math.floor(DISPLAY_SIZE * LOGO_RATIO);
          const circleSize = logoSize + LOGO_BORDER * 2;
          const cx = DISPLAY_SIZE / 2;
          const cy = DISPLAY_SIZE / 2;

          ctx!.fillStyle = 'white';
          ctx!.beginPath();
          ctx!.arc(cx, cy, circleSize / 2, 0, Math.PI * 2);
          ctx!.fill();

          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = logoUrl!;
          });

          if (!cancelled) {
            ctx!.save();
            ctx!.beginPath();
            ctx!.arc(cx, cy, logoSize / 2, 0, Math.PI * 2);
            ctx!.clip();
            ctx!.drawImage(img, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
            ctx!.restore();
          }
        }
      } catch {
        // silently ignore render errors (invalid URL etc.)
      }
    }

    render();
    return () => { cancelled = true; };
  }, [url, style, logoUrl]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
      className="rounded-lg"
    />
  );
}
