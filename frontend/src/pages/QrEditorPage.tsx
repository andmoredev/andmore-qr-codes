import { useEffect, useRef, useState, ChangeEvent, DragEvent, FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Link2,
  QrCode as QrIcon,
  Save,
  Upload,
  X,
} from 'lucide-react';
import { createQr, getQr, updateQr } from '../services/qrs';
import { listPages } from '../services/pages';
import { QrLivePreview } from '../components/QrLivePreview';
import type { LinkPage, QrCode, QrType, QrStyle } from '../types';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function QrEditorPage() {
  const { qrId } = useParams<{ qrId: string }>();
  const editMode = Boolean(qrId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(editMode);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [name, setName] = useState('');
  const [type, setType] = useState<QrType>('direct');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [pageId, setPageId] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [style, setStyle] = useState<QrStyle>('square');

  const [pages, setPages] = useState<LinkPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [pagesError, setPagesError] = useState('');

  // Logo handling
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);
  const [logoCleared, setLogoCleared] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setPagesLoading(true);
    listPages()
      .then(items => {
        if (!cancelled) setPages(items);
      })
      .catch(err => {
        if (!cancelled) setPagesError(err instanceof Error ? err.message : 'Failed to load pages');
      })
      .finally(() => {
        if (!cancelled) setPagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!editMode || !qrId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    getQr(qrId)
      .then(qr => {
        if (cancelled) return;
        hydrateFromQr(qr);
      })
      .catch(err => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load QR code');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrId]);

  const hydrateFromQr = (qr: QrCode) => {
    setName(qr.name);
    setType(qr.type);
    setDestinationUrl(qr.destinationUrl ?? '');
    setPageId(qr.pageId ?? '');
    setEnabled(qr.enabled);
    setStyle(qr.style ?? 'square');
    setExistingLogoUrl(qr.logoUrl ?? null);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoCleared(false);
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setLogoCleared(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setExistingLogoUrl(null);
    setLogoCleared(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required.';
    if (type === 'direct') {
      if (!destinationUrl.trim()) return 'Destination URL is required.';
      if (!isValidUrl(destinationUrl.trim())) return 'Destination must be a valid http(s) URL.';
    } else {
      if (!pageId) return 'Please choose a page.';
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitError('');
    setSuccessMessage('');
    setSubmitting(true);
    try {
      const logoBase64 = logoFile ? await fileToBase64(logoFile) : undefined;

      if (editMode && qrId) {
        const body: Parameters<typeof updateQr>[1] = {
          name: name.trim(),
          style,
          enabled,
        };
        if (type === 'direct') {
          body.destinationUrl = destinationUrl.trim();
        } else {
          body.pageId = pageId;
        }
        if (logoBase64) {
          body.logoBase64 = logoBase64;
        } else if (logoCleared) {
          body.logoBase64 = null;
        }
        await updateQr(qrId, body);
        setSuccessMessage('Changes saved.');
      } else {
        const body: Parameters<typeof createQr>[0] = {
          name: name.trim(),
          type,
          style,
          ...(type === 'direct'
            ? { destinationUrl: destinationUrl.trim() }
            : { pageId }),
          ...(logoBase64 ? { logoBase64 } : {}),
        };
        const created = await createQr(body);
        navigate(`/qrs/${created.qrId}`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save QR code');
    } finally {
      setSubmitting(false);
    }
  };

  const renderLogoSection = () => {
    const preview = logoPreview ?? existingLogoUrl;
    return (
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ImageIcon className="w-3.5 h-3.5 text-text-muted" />
          Center Logo <span className="text-text-muted font-normal">(optional)</span>
        </label>

        {preview ? (
          <div className="flex items-center gap-3 bg-muted border border-border rounded-lg px-4 py-3">
            <img src={preview} alt="Logo preview" className="w-10 h-10 object-cover rounded-md" />
            <span className="text-sm text-foreground flex-1 truncate">
              {logoFile?.name ?? 'Current logo'}
            </span>
            <button
              type="button"
              onClick={clearLogo}
              className="text-text-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label="Remove logo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={e => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg px-4 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors duration-150 ${
              dragging
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-accent/50 hover:bg-muted'
            }`}
            aria-label="Upload logo image"
          >
            <Upload className="w-5 h-5 text-text-muted" />
            <p className="text-sm text-text-muted">
              Drop an image here or <span className="text-accent">browse</span>
            </p>
            <p className="text-xs text-text-muted">Square images work best (min 125x125px)</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
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
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          to={editMode && qrId ? `/qrs/${qrId}` : '/qrs'}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {editMode ? 'Back to QR detail' : 'Back to QR codes'}
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground mt-2">
          <QrIcon className="w-5 h-5 text-accent" />
          {editMode ? 'Edit QR code' : 'Create QR code'}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border rounded-xl p-6 space-y-5"
      >
        {/* Name */}
        <div className="space-y-1.5">
          <label htmlFor="qr-name" className="text-sm font-medium text-foreground">
            Name
          </label>
          <input
            id="qr-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Conference booth banner"
            required
            className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
          />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Type</span>
          <div
            role="radiogroup"
            aria-label="QR type"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={type === 'direct'}
              onClick={() => setType('direct')}
              disabled={editMode}
              className={`flex items-start gap-3 text-left p-3 rounded-lg border transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                type === 'direct'
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-muted hover:border-accent/50'
              }`}
            >
              <ExternalLink className="w-4 h-4 mt-0.5 text-accent" />
              <div>
                <p className="text-sm font-medium text-foreground">Direct URL</p>
                <p className="text-xs text-text-muted">Scans send users to a single URL.</p>
              </div>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'page'}
              onClick={() => setType('page')}
              disabled={editMode}
              className={`flex items-start gap-3 text-left p-3 rounded-lg border transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                type === 'page'
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-muted hover:border-accent/50'
              }`}
            >
              <Link2 className="w-4 h-4 mt-0.5 text-accent" />
              <div>
                <p className="text-sm font-medium text-foreground">Links Page</p>
                <p className="text-xs text-text-muted">Send to a hosted links page.</p>
              </div>
            </button>
          </div>
          {editMode && (
            <p className="text-xs text-text-muted">
              Type cannot be changed after creation.
            </p>
          )}
        </div>

        {/* Destination or Page */}
        {type === 'direct' ? (
          <div className="space-y-1.5">
            <label htmlFor="qr-destination" className="text-sm font-medium text-foreground">
              Destination URL
            </label>
            <input
              id="qr-destination"
              type="url"
              value={destinationUrl}
              onChange={e => setDestinationUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="qr-page" className="text-sm font-medium text-foreground">
              Page
            </label>
            {pagesLoading ? (
              <div className="h-10 bg-muted rounded-lg animate-pulse" />
            ) : pagesError ? (
              <p className="text-sm text-destructive">{pagesError}</p>
            ) : pages.length === 0 ? (
              <div className="bg-muted border border-border rounded-lg px-3 py-3 text-sm text-text-muted">
                You don&apos;t have any pages yet.{' '}
                <Link to="/pages/new" className="text-accent hover:underline">
                  Create one
                </Link>{' '}
                to link it here.
              </div>
            ) : (
              <select
                id="qr-page"
                value={pageId}
                onChange={e => setPageId(e.target.value)}
                required
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
              >
                <option value="">Select a page…</option>
                {pages.map(p => (
                  <option key={p.pageId} value={p.pageId}>
                    {p.displayName} ({p.slug})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Logo */}
        {renderLogoSection()}

        {/* Dot style */}
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Dot style</span>
          <div role="radiogroup" aria-label="QR dot style" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { value: 'square'  as QrStyle, label: 'Square'  },
              { value: 'rounded' as QrStyle, label: 'Rounded' },
              { value: 'dots'    as QrStyle, label: 'Dots'    },
              { value: 'fluid'   as QrStyle, label: 'Fluid'   },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={style === value}
                onClick={() => setStyle(value)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors duration-150 cursor-pointer ${
                  style === value
                    ? 'border-accent bg-accent/5'
                    : 'border-border bg-muted hover:border-accent/50'
                }`}
              >
                <QrStylePreview variant={value} active={style === value} />
                <span className="text-xs font-medium text-foreground">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Live preview */}
        {(type === 'direct' ? isValidUrl(destinationUrl) : Boolean(pageId)) && (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Preview</span>
            <div className="flex justify-center bg-muted border border-border rounded-xl p-4">
              <QrLivePreview
                url={type === 'direct' ? destinationUrl : `https://andmore.app/r/${pageId}`}
                style={style}
                logoUrl={logoCleared ? null : (logoPreview ?? existingLogoUrl)}
              />
            </div>
            <p className="text-xs text-text-muted text-center">
              Preview only — the saved QR will encode the scan-redirect URL.
            </p>
          </div>
        )}

        {/* Enabled toggle (edit mode only) */}
        {editMode && (
          <div className="flex items-center justify-between gap-4 bg-muted border border-border rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Enabled</p>
              <p className="text-xs text-text-muted">
                Disabled QR codes stop redirecting when scanned.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 cursor-pointer ${
                enabled ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
                  enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}

        {submitError && (
          <div className="bg-destructive/10 border border-destructive/40 text-destructive text-sm rounded-lg px-4 py-3">
            {submitError}
          </div>
        )}

        {successMessage && (
          <div className="bg-accent/10 border border-accent/40 text-accent text-sm rounded-lg px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {successMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            to={editMode && qrId ? `/qrs/${qrId}` : '/qrs'}
            className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted transition-colors duration-150"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors duration-150 cursor-pointer"
          >
            {submitting ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {editMode ? 'Save changes' : 'Create QR'}
          </button>
        </div>
      </form>
    </div>
  );
}

function QrStylePreview({ variant, active }: { variant: QrStyle; active: boolean }) {
  const fill = active ? '#22C55E' : '#475569';
  const size = 40;
  const cell = size / 5;
  const gap = 1;
  const mod = cell - gap;

  if (variant === 'fluid') {
    // Show two overlapping blobs (L-shaped group) + corner isolated dots
    const cr = mod * 0.4;
    // 2×2 blob at rows 1-2, cols 2-3
    const bx = 2 * cell + gap / 2;
    const by = 1 * cell + gap / 2;
    const bw = 2 * mod + gap;
    const bh = 2 * mod + gap;
    // single attached module below-left of blob
    const ex = 1 * cell + gap / 2;
    const ey = 2 * cell + gap / 2;
    // isolated corner dots
    const corners: [number, number][] = [[0, 0], [0, 4], [4, 0], [4, 4]];
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* merged blob — single rounded rect spanning 2×2 */}
        <rect x={bx} y={by} width={bw} height={bh} rx={cr} ry={cr} fill={fill} />
        {/* extra module extending left, flush on shared edge */}
        <rect x={ex} y={ey} width={mod} height={mod} rx={cr} ry={cr} fill={fill} />
        {/* bridge between extra module and blob (fills the gap at their shared corner) */}
        <rect x={bx - cr * 0.8} y={ey} width={cr * 0.8} height={mod} fill={fill} />
        {/* inner concave fill at junction */}
        <circle cx={bx} cy={ey + mod} r={cr * 0.85} fill={fill} />
        {/* isolated corner dots */}
        {corners.map(([r, c]) => (
          <rect
            key={`${r}-${c}`}
            x={c * cell + gap / 2} y={r * cell + gap / 2}
            width={mod} height={mod}
            rx={cr} ry={cr}
            fill={fill}
          />
        ))}
      </svg>
    );
  }

  const grid = [0, 1, 2, 3, 4].flatMap(r => [0, 1, 2, 3, 4].map(c => ({ r, c })));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {grid.map(({ r, c }) => {
        const x = c * cell + gap / 2;
        const y = r * cell + gap / 2;
        if (variant === 'dots') {
          return (
            <circle key={`${r}-${c}`} cx={x + mod / 2} cy={y + mod / 2} r={mod / 2 * 0.85} fill={fill} />
          );
        }
        const rx = variant === 'rounded' ? mod * 0.28 : 0;
        return <rect key={`${r}-${c}`} x={x} y={y} width={mod} height={mod} rx={rx} ry={rx} fill={fill} />;
      })}
    </svg>
  );
}
