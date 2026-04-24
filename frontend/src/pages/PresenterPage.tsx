import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Maximize, Minimize, Moon, Sun, Pencil } from 'lucide-react';
import { getQr } from '../services/qrs';
import type { QrCode } from '../types';
import { QrLivePreview } from '../components/QrLivePreview';

type PresenterTheme = 'light' | 'dark';

const DEFAULT_CAPTION = 'Scan to connect';
const CONTROLS_HIDE_MS = 2500;

function computeQrSize(): number {
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  return Math.min(600, Math.max(240, Math.round(vmin * 0.62)));
}

export function PresenterPage() {
  const { qrId } = useParams<{ qrId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const [qr, setQr] = useState<QrCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [theme, setTheme] = useState<PresenterTheme>(
    (searchParams.get('theme') as PresenterTheme) === 'dark' ? 'dark' : 'light',
  );
  const [caption, setCaption] = useState<string>(searchParams.get('caption') ?? DEFAULT_CAPTION);
  const [captionEditing, setCaptionEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [qrSize, setQrSize] = useState(() =>
    typeof window === 'undefined' ? 480 : computeQrSize(),
  );

  useEffect(() => {
    if (!qrId) return;
    setLoading(true);
    getQr(qrId)
      .then((data) => setQr(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load QR code'))
      .finally(() => setLoading(false));
  }, [qrId]);

  useEffect(() => {
    const onResize = () => setQrSize(computeQrSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const show = () => {
      setControlsVisible(true);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    };
    window.addEventListener('mousemove', show);
    window.addEventListener('keydown', show);
    show();
    return () => {
      window.removeEventListener('mousemove', show);
      window.removeEventListener('keydown', show);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
      } catch {
        // browser denied — no-op
      }
    } else {
      try {
        await document.exitFullscreen();
      } catch {
        // no-op
      }
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (captionEditing) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 't' || e.key === 'T') {
        setTheme((t) => (t === 'light' ? 'dark' : 'light'));
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        navigate(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFullscreen, captionEditing, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (caption && caption !== DEFAULT_CAPTION) params.set('caption', caption);
    else params.delete('caption');
    if (theme === 'dark') params.set('theme', 'dark');
    else params.delete('theme');
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, theme]);

  const redirectUrl = qrId ? `${window.location.origin}/r/${qrId}` : '';
  const isDark = theme === 'dark';

  const bgClass = isDark ? 'bg-black text-white' : 'bg-white text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const buttonClass = isDark
    ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
    : 'bg-slate-900/5 hover:bg-slate-900/10 text-slate-900 border border-slate-900/10';

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgClass}`}>
        <span className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !qr) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-4 ${bgClass}`}>
        <p className="text-lg">{error || 'QR code not found.'}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${buttonClass}`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`min-h-screen w-full flex flex-col items-center justify-center px-6 py-10 transition-colors duration-200 ${bgClass}`}
      style={{ cursor: controlsVisible ? 'default' : 'none' }}
    >
      {/* Top controls */}
      <div
        className={`fixed top-4 left-4 right-4 flex items-center justify-between transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${buttonClass}`}
          aria-label="Exit presenter mode"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${buttonClass}`}
            aria-label="Toggle theme"
            title="Toggle theme (T)"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${buttonClass}`}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit full' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="flex flex-col items-center gap-10 max-w-full">
        {captionEditing ? (
          <input
            autoFocus
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => setCaptionEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                setCaptionEditing(false);
              }
            }}
            className={`bg-transparent border-b-2 ${
              isDark ? 'border-white/40 placeholder-white/40' : 'border-slate-900/30 placeholder-slate-400'
            } text-center text-3xl sm:text-4xl font-semibold outline-none px-2 py-1 min-w-[14ch] max-w-full`}
            placeholder="Add a caption…"
            maxLength={80}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCaptionEditing(true)}
            className={`group inline-flex items-center gap-2 text-3xl sm:text-4xl font-semibold tracking-tight text-center ${
              caption ? '' : mutedClass
            }`}
            aria-label="Edit caption"
          >
            {caption || 'Add a caption…'}
            <Pencil
              className={`w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity ${mutedClass}`}
            />
          </button>
        )}

        <div
          className={`rounded-2xl p-4 sm:p-6 ${
            isDark ? 'bg-white' : 'bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.25)]'
          }`}
        >
          <QrLivePreview
            url={redirectUrl}
            style={qr.style}
            logoUrl={qr.logoUrl ?? null}
            size={qrSize}
            className="rounded-lg"
          />
        </div>

        <div className={`text-sm sm:text-base ${mutedClass} text-center break-all max-w-full`}>
          {redirectUrl}
        </div>

        {!qr.enabled && (
          <div className="text-xs sm:text-sm text-amber-500 border border-amber-500/40 bg-amber-500/10 rounded-full px-3 py-1">
            This QR is disabled — scans won't redirect until you enable it.
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 text-xs ${mutedClass} transition-opacity duration-300 ${
          controlsVisible ? 'opacity-80' : 'opacity-0'
        }`}
      >
        <kbd className="font-mono">F</kbd> fullscreen · <kbd className="font-mono">T</kbd> theme · <kbd className="font-mono">Esc</kbd> exit · click caption to edit
      </div>
    </div>
  );
}
