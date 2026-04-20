import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, Loader2, QrCode, X } from 'lucide-react';
import { ApiError, getPagePreview } from '../services/pages';
import { PublicPageView } from '../components/PublicPageView';
import type { PublicPage as PublicPageData } from '../types';

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; data: PublicPageData }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/**
 * Authenticated draft preview of a Links Page.
 *
 * Route: `/pages/:pageId/preview` (wrapped in `<ProtectedRoute>`).
 *
 * Fetches the owner-scoped preview payload (same shape as `GET /public/pages/{slug}`)
 * and renders it with `<PublicPageView>` so the preview is pixel-identical to the
 * public render. A banner at the top reminds the owner the page is a draft preview
 * and offers a link back to the editor.
 */
export function PagePreviewPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!pageId) {
      setState({ status: 'not-found' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    getPagePreview(pageId)
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load preview';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0F172A]">
        <Loader2
          className="w-8 h-8 text-[#22C55E] animate-spin"
          strokeWidth={2}
          aria-label="Loading preview"
        />
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <NotFoundScreen
        pageId={pageId}
        message="We couldn't find a draft for this page. It may have been deleted, or you don't own it."
      />
    );
  }

  if (state.status === 'error') {
    return (
      <NotFoundScreen
        pageId={pageId}
        message={state.message}
        errorIcon
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0F172A]">
      <PreviewBanner pageId={pageId} />
      <PublicPageView page={state.data} srcQrId={null} />
    </div>
  );
}

function PreviewBanner({ pageId }: { pageId?: string }) {
  return (
    <div
      role="status"
      aria-label="Draft preview banner"
      className="sticky top-0 z-20 w-full bg-[#1E293B] border-b border-[#334155] text-[#F8FAFC]"
    >
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3 text-xs sm:text-sm">
        <Eye className="w-4 h-4 text-[#22C55E] shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="flex-1 leading-snug">
          <span className="font-medium">Draft preview</span>
          <span className="text-[#94A3B8]"> — only visible to you.</span>
        </span>
        {pageId && (
          <RouterLink
            to={`/pages/${pageId}`}
            className="inline-flex items-center gap-1 font-medium text-[#22C55E] hover:text-[#4ADE80] underline-offset-4 hover:underline"
          >
            Back to editor
          </RouterLink>
        )}
        {pageId && (
          <RouterLink
            to={`/pages/${pageId}`}
            aria-label="Close preview"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#334155] transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </RouterLink>
        )}
      </div>
    </div>
  );
}

function NotFoundScreen({
  pageId,
  message,
  errorIcon,
}: {
  pageId?: string;
  message: string;
  errorIcon?: boolean;
}) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0F172A] text-[#F8FAFC] px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#1E293B] border border-[#334155] flex items-center justify-center mb-5">
        {errorIcon ? (
          <AlertCircle className="w-7 h-7 text-[#F87171]" strokeWidth={2} />
        ) : (
          <QrCode className="w-7 h-7 text-[#22C55E]" strokeWidth={2} />
        )}
      </div>
      <h1 className="text-xl sm:text-2xl font-semibold mb-2">
        Preview unavailable
      </h1>
      <p className="text-sm sm:text-base text-[#94A3B8] max-w-sm">{message}</p>
      <RouterLink
        to={pageId ? `/pages/${pageId}` : '/pages'}
        className="mt-8 inline-flex items-center gap-1.5 text-sm text-[#22C55E] hover:text-[#4ADE80] underline-offset-4 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={2} />
        Back to editor
      </RouterLink>
    </div>
  );
}
