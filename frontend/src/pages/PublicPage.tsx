import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, QrCode } from 'lucide-react';
import { getPublicPage } from '../services/publicPages';
import { PublicPageView } from '../components/PublicPageView';
import type { PublicPage as PublicPageData } from '../types';

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; data: PublicPageData }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export function PublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const src = searchParams.get('src');

  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!slug) {
      setState({ status: 'not-found' });
      return;
    }

    // Backend A redirects unpublished / unknown QRs to `/p/unavailable`.
    // Short-circuit the API call and render the same friendly screen.
    if (slug === 'unavailable') {
      setState({ status: 'not-found' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    getPublicPage(slug)
      .then(data => {
        if (cancelled) return;
        setState({ status: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load page';
        if (message === 'not-found') {
          setState({ status: 'not-found' });
        } else {
          setState({ status: 'error', message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0F172A]">
        <Loader2
          className="w-8 h-8 text-[#22C55E] animate-spin"
          strokeWidth={2}
          aria-label="Loading page"
        />
      </div>
    );
  }

  if (state.status === 'not-found') {
    return <UnavailableScreen />;
  }

  if (state.status === 'error') {
    return <UnavailableScreen message="We couldn't load this page. Please try again in a moment." />;
  }

  return <PublicPageView page={state.data} srcQrId={src} />;
}

function UnavailableScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0F172A] text-[#F8FAFC] px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#1E293B] border border-[#334155] flex items-center justify-center mb-5">
        <QrCode className="w-7 h-7 text-[#22C55E]" strokeWidth={2} />
      </div>
      <h1 className="text-xl sm:text-2xl font-semibold mb-2">
        This page is unavailable
      </h1>
      <p className="text-sm sm:text-base text-[#94A3B8] max-w-sm">
        {message ?? 'The Links Page you’re looking for isn’t published right now. Check back later or reach out to the owner.'}
      </p>
      <a
        href="/"
        className="mt-8 text-xs text-[#94A3B8] hover:text-[#F8FAFC] underline-offset-4 hover:underline"
      >
        Made with andmore
      </a>
    </div>
  );
}
