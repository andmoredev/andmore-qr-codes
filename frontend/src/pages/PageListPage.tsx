import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Plus, Link2, ExternalLink, User, AlertCircle } from 'lucide-react';
import { listPages } from '../services/pages';
import type { LinkPage } from '../types';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: LinkPage['status'] }) {
  const isPublished = status === 'published';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
        isPublished
          ? 'bg-accent/15 text-accent'
          : 'bg-muted text-text-muted border border-border'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isPublished ? 'bg-accent' : 'bg-text-muted'}`}
      />
      {isPublished ? 'Published' : 'Draft'}
    </span>
  );
}

export function PageListPage() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<LinkPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listPages()
      .then((items) => setPages(items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pages'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Link2 className="w-5 h-5 text-accent" />
            Links Pages
          </h1>
          <p className="text-sm text-text-muted mt-1">
            LinkTree-style public pages you can attach to QR codes.
          </p>
        </div>
        <button
          onClick={() => navigate('/pages/new')}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-3 py-2 text-sm transition-colors duration-150 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Links Page
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/40 rounded-lg px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-4 space-y-3 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-2.5 bg-muted rounded w-1/2" />
                </div>
              </div>
              <div className="h-2.5 bg-muted rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : pages.length === 0 && !error ? (
        <div className="bg-surface border border-border rounded-xl py-16 px-6 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
            <Link2 className="w-5 h-5 text-text-muted" />
          </div>
          <div>
            <p className="font-medium text-foreground">No Links Pages yet</p>
            <p className="text-sm text-text-muted mt-1">
              Create your first page to share a bundle of links behind one QR code.
            </p>
          </div>
          <button
            onClick={() => navigate('/pages/new')}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-3 py-2 text-sm transition-colors duration-150 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Links Page
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((page) => (
            <RouterLink
              key={page.pageId}
              to={`/pages/${page.pageId}`}
              className="bg-surface border border-border rounded-xl p-4 space-y-3 hover:border-accent/60 transition-colors duration-150 group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                  {page.avatarUrl ? (
                    <img
                      src={page.avatarUrl}
                      alt={`${page.displayName} avatar`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-4 h-4 text-text-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate group-hover:text-accent transition-colors">
                    {page.displayName}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(`/p/${page.slug}`, '_blank', 'noopener');
                    }}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
                    aria-label={`Open /p/${page.slug} in new tab`}
                  >
                    /p/{page.slug}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <StatusBadge status={page.status} />
                <span className="text-xs text-text-muted">
                  {page.links.length} {page.links.length === 1 ? 'link' : 'links'}
                </span>
              </div>

              <p className="text-xs text-text-muted">
                Updated {formatDate(page.updatedAt)}
              </p>
            </RouterLink>
          ))}
        </div>
      )}
    </div>
  );
}
