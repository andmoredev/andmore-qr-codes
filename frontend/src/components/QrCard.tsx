import { Link } from 'react-router-dom';
import { CheckCircle2, CircleOff, ExternalLink, Link2, QrCode as QrIcon } from 'lucide-react';
import type { QrCode } from '../types';

interface Props {
  qr: QrCode;
}

export function QrCard({ qr }: Props) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3 group flex flex-col">
      <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
        {qr.qrCodeUrl ? (
          <img
            src={qr.qrCodeUrl}
            alt={`QR code for ${qr.name}`}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <QrIcon className="w-10 h-10 text-text-muted" />
          </div>
        )}
      </div>

      <div className="space-y-2 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground truncate" title={qr.name}>
            {qr.name}
          </p>
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border shrink-0 ${
              qr.type === 'page'
                ? 'border-accent/40 text-accent bg-accent/10'
                : 'border-border text-text-muted bg-muted'
            }`}
          >
            {qr.type === 'page' ? <Link2 className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
            {qr.type === 'page' ? 'Page' : 'Direct'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span>{new Date(qr.createdAt).toLocaleDateString()}</span>
          <span
            className={`inline-flex items-center gap-1 ${
              qr.enabled ? 'text-accent' : 'text-destructive'
            }`}
            aria-label={qr.enabled ? 'Enabled' : 'Disabled'}
          >
            {qr.enabled ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                Enabled
              </>
            ) : (
              <>
                <CircleOff className="w-3 h-3" />
                Disabled
              </>
            )}
          </span>
        </div>

        <Link
          to={`/qrs/${qr.qrId}`}
          className="mt-auto inline-flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/70 border border-border rounded-lg py-1.5 text-xs text-foreground transition-colors duration-150"
          aria-label={`Open ${qr.name}`}
        >
          Open
        </Link>
      </div>
    </div>
  );
}
