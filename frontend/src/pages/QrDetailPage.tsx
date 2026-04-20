import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Pencil,
  Power,
  QrCode as QrIcon,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  deleteQr,
  getQr,
  listQrVersions,
  restoreQrVersion,
  updateQr,
} from '../services/qrs';
import type { QrCode } from '../types';
import { VersionsPanel } from '../components/VersionsPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function QrDetailPage() {
  const { qrId } = useParams<{ qrId: string }>();
  const navigate = useNavigate();

  const [qr, setQr] = useState<QrCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [versionsKey, setVersionsKey] = useState(0);

  const load = useCallback(async () => {
    if (!qrId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getQr(qrId);
      setQr(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load QR code');
    } finally {
      setLoading(false);
    }
  }, [qrId]);

  useEffect(() => {
    load();
  }, [load]);

  const redirectUrl = qrId ? `${window.location.origin}/r/${qrId}` : '';

  const handleCopy = async () => {
    if (!redirectUrl) return;
    try {
      await navigator.clipboard.writeText(redirectUrl);
      setCopyConfirmed(true);
      setTimeout(() => setCopyConfirmed(false), 2000);
    } catch {
      setActionError('Could not copy link.');
    }
  };

  const handleToggleEnabled = async () => {
    if (!qr || !qrId) return;
    setActionError('');
    setTogglingEnabled(true);
    try {
      const updated = await updateQr(qrId, { enabled: !qr.enabled });
      setQr(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update QR');
    } finally {
      setTogglingEnabled(false);
    }
  };

  const handleDelete = async () => {
    if (!qrId) return;
    setActionError('');
    setDeleting(true);
    try {
      await deleteQr(qrId);
      navigate('/qrs');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete QR');
      setDeleting(false);
    }
  };

  const handleRestore = async (version: number) => {
    if (!qrId) return;
    await restoreQrVersion(qrId, version);
    await load();
    setVersionsKey(k => k + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !qr) {
    return (
      <div className="space-y-4">
        <Link
          to="/qrs"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to QR codes
        </Link>
        <div className="bg-destructive/10 border border-destructive/40 text-destructive text-sm rounded-lg px-4 py-3">
          {error || 'QR code not found.'}
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            to="/qrs"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to QR codes
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground mt-2">
            <QrIcon className="w-5 h-5 text-accent" />
            {qr.name}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/qrs/${qr.qrId}/edit`}
            className="inline-flex items-center gap-1.5 bg-muted border border-border hover:bg-muted/70 text-foreground rounded-lg px-3 py-2 text-sm transition-colors duration-150"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Link>
          <button
            type="button"
            onClick={handleToggleEnabled}
            disabled={togglingEnabled}
            className="inline-flex items-center gap-1.5 bg-muted border border-border hover:bg-muted/70 text-foreground rounded-lg px-3 py-2 text-sm transition-colors duration-150 disabled:opacity-50 cursor-pointer"
            aria-label={qr.enabled ? 'Disable QR code' : 'Enable QR code'}
          >
            {togglingEnabled ? (
              <span className="w-3.5 h-3.5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            {qr.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 bg-muted border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive rounded-lg px-3 py-2 text-sm text-foreground transition-colors duration-150 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>

      {actionError && (
        <div className="bg-destructive/10 border border-destructive/40 text-destructive text-sm rounded-lg px-4 py-3">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: preview + metadata */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="w-full sm:w-56 shrink-0">
                <div className="aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                  {qr.qrCodeUrl ? (
                    <img
                      src={qr.qrCodeUrl}
                      alt={`QR code for ${qr.name}`}
                      className="w-full h-full object-contain p-3"
                    />
                  ) : (
                    <QrIcon className="w-12 h-12 text-text-muted" />
                  )}
                </div>
                {qr.qrCodeUrl && (
                  <a
                    href={qr.qrCodeUrl}
                    download={`${qr.name.replace(/\s+/g, '-').toLowerCase()}-qr.png`}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PNG
                  </a>
                )}
              </div>

              <div className="flex-1 space-y-4 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                      qr.type === 'page'
                        ? 'border-accent/40 text-accent bg-accent/10'
                        : 'border-border text-text-muted bg-muted'
                    }`}
                  >
                    {qr.type === 'page' ? <Link2 className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                    {qr.type === 'page' ? 'Links Page' : 'Direct URL'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                      qr.enabled
                        ? 'border-accent/40 text-accent bg-accent/10'
                        : 'border-destructive/40 text-destructive bg-destructive/10'
                    }`}
                  >
                    {qr.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                {/* Redirect URL */}
                <div className="space-y-1.5">
                  <label className="text-xs text-text-muted">Scan URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground truncate" title={redirectUrl}>
                      {redirectUrl}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 bg-muted border border-border hover:bg-muted/70 text-foreground rounded-lg px-3 py-2 text-xs transition-colors duration-150 cursor-pointer shrink-0"
                      aria-label="Copy scan URL"
                    >
                      {copyConfirmed ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-accent" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Destination / Page */}
                {qr.type === 'direct' ? (
                  <div className="space-y-1">
                    <p className="text-xs text-text-muted">Destination</p>
                    {qr.destinationUrl ? (
                      <a
                        href={qr.destinationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline break-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        {qr.destinationUrl}
                      </a>
                    ) : (
                      <p className="text-sm text-text-muted">—</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-text-muted">Page</p>
                    {qr.pageId ? (
                      <Link
                        to={`/pages/${qr.pageId}`}
                        className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Open page
                      </Link>
                    ) : (
                      <p className="text-sm text-text-muted">—</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs text-text-muted">Created</p>
                    <p className="inline-flex items-center gap-1.5 text-sm text-foreground">
                      <Calendar className="w-3.5 h-3.5 text-text-muted" />
                      {new Date(qr.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-text-muted">Updated</p>
                    <p className="inline-flex items-center gap-1.5 text-sm text-foreground">
                      <Calendar className="w-3.5 h-3.5 text-text-muted" />
                      {new Date(qr.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Analytics placeholder slot — wired by workstream I */}
          <div id="analytics-slot" className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted">
            {/* TODO wired by I */}
            Analytics will appear here.
          </div>
        </div>

        {/* Right: versions sidebar */}
        <aside className="space-y-4">
          <VersionsPanel
            key={`versions-${qrId}`}
            loader={() => listQrVersions(qrId!)}
            restore={handleRestore}
            reloadKey={versionsKey}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this QR code?"
        description={
          <>
            Deleting <strong className="text-foreground">{qr.name}</strong> will stop the QR from redirecting. This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => (deleting ? undefined : setDeleteOpen(false))}
      />
    </div>
  );
}
