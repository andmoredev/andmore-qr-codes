import { useEffect, useRef } from 'react';
import type { QrStyle } from '../types';
import { renderQrToCanvas } from '../lib/renderQr';

interface QrLivePreviewProps {
  url: string;
  style: QrStyle;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}

export function QrLivePreview({
  url,
  style,
  logoUrl,
  size = 220,
  className = 'rounded-lg',
}: QrLivePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signal = { cancelled: false };
    renderQrToCanvas(canvas, { url, style, logoUrl, size }, signal);
    return () => { signal.cancelled = true; };
  }, [url, style, logoUrl, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}
