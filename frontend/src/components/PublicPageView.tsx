import { CSSProperties, useMemo } from 'react';
import type { LinkKind, PublicPage, Theme } from '../types';
import { iconForLink } from './publicPageIcons';

/**
 * Subset of a Links Page that the renderer needs. This is intentionally loose
 * so callers can pass a `PublicPage`, an owner-scoped `LinkPage`, or a
 * partially-filled editor form shape without type gymnastics.
 *
 * `clickHref` is only used when `interactive` is true.
 */
export interface PublicPageViewModel {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  theme?: Theme;
  accentColor?: string;
  links?: Array<{
    linkKey: string;
    kind: LinkKind;
    label?: string;
    icon?: string;
    clickHref?: string;
    order?: number;
  }>;
}

interface Props {
  page: PublicPage | PublicPageViewModel;
  /**
   * When true (default) links render as `<a target="_blank">` with click-through
   * behavior. When false, links render as visually identical `<div role="link">`
   * with navigation disabled — used by the editor's live preview.
   */
  interactive?: boolean;
  /**
   * QR id that attributed this scan. Passed through to every outbound click.
   * Ignored when `interactive` is false.
   */
  srcQrId?: string | null;
}

/**
 * Pure-presentational renderer for a published Links Page.
 *
 * This component is shared between the live preview inside the Links Page editor
 * and the public `/p/:slug` route. It takes a `PublicPage`-compatible shape and
 * renders it verbatim — no fetching, no routing, no auth.
 *
 * Light / dark theme is driven by the `theme` field on the page and applied via
 * local Tailwind classes on the outer wrapper so the public page can render
 * independently of the app's dark-only theme tokens.
 */
export function PublicPageView({ page, interactive = true, srcQrId }: Props) {
  const displayName = page.displayName ?? '';
  const bio = page.bio ?? '';
  const theme: Theme = page.theme ?? 'dark';
  const accent = page.accentColor || '#22C55E';
  const links = page.links ?? [];

  const initials = useMemo(() => deriveInitials(displayName), [displayName]);
  // The API already sorts by `order`. Be defensive: if the consumer (e.g. the
  // live preview in the editor) passes an unsorted list that happens to carry
  // `order`, respect it; otherwise preserve the incoming order.
  const sortedLinks = useMemo(() => {
    const arr = [...links] as Array<{
      linkKey: string;
      kind: LinkKind;
      label?: string;
      icon?: string;
      clickHref?: string;
      order?: number;
    }>;
    const anyHasOrder = arr.some(l => typeof l.order === 'number');
    if (!anyHasOrder) return arr;
    return arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [links]);

  const isDark = theme === 'dark';

  // Expose the accent color as a CSS variable so Tailwind's arbitrary values
  // (e.g. `border-[color:var(--accent)]`) pick it up.
  const rootStyle: CSSProperties = { ['--accent' as string]: accent };

  const wrapperTheme = isDark
    ? 'bg-[#0F172A] text-[#F8FAFC]'
    : 'bg-[#F8FAFC] text-[#0F172A]';

  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#475569]';
  const avatarRing = isDark ? 'ring-[#1E293B]' : 'ring-white';
  const avatarFallbackBg = isDark ? 'bg-[#1E293B]' : 'bg-white';

  const linkBase = isDark
    ? 'bg-[#1E293B]/60 border-[#334155]'
    : 'bg-white border-[#E2E8F0]';
  const linkHover = interactive
    ? isDark
      ? 'hover:bg-[#1E293B]'
      : 'hover:bg-[#F1F5F9]'
    : '';

  // Public/draft routes render against the full viewport; the editor preview
  // lives inside a sidebar card, so fill the parent instead.
  const minHeightClass = interactive ? 'min-h-screen' : 'min-h-full';

  return (
    <div
      className={`${minHeightClass} w-full flex flex-col items-center px-4 py-10 sm:py-14 ${wrapperTheme}`}
      style={rootStyle}
      data-theme={theme}
    >
      <div className="w-full max-w-[480px] flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-4">
          {page.avatarUrl ? (
            <img
              src={page.avatarUrl}
              alt={`${displayName} avatar`}
              width={96}
              height={96}
              className={`w-24 h-24 rounded-full object-cover ring-2 ring-offset-0 ${avatarRing}`}
              style={{ borderColor: 'var(--accent)' }}
            />
          ) : (
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center text-2xl font-semibold ring-2 ${avatarRing} ${avatarFallbackBg}`}
              style={{ color: 'var(--accent)' }}
              aria-hidden="true"
            >
              {initials}
            </div>
          )}

          <div className="text-center flex flex-col gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight break-words">
              {displayName || 'Your name'}
            </h1>
            {bio ? (
              <p className={`text-sm sm:text-base leading-relaxed ${mutedText} break-words`}>
                {bio}
              </p>
            ) : null}
          </div>
        </div>

        <ul className="w-full flex flex-col gap-3 mt-2">
          {sortedLinks.map(link => {
            const Icon = iconForLink(link.kind, link.icon);
            const label = link.label || 'Untitled link';
            const commonClass = `group flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border transition-colors duration-150 ${linkBase} ${linkHover}`;
            const commonStyle = { borderColor: 'var(--accent)' };
            const content = (
              <>
                <Icon
                  className="w-5 h-5 shrink-0"
                  style={{ color: 'var(--accent)' }}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span className="text-sm sm:text-base font-medium text-center flex-1 truncate">
                  {label}
                </span>
              </>
            );

            return (
              <li key={link.linkKey}>
                {interactive ? (
                  <a
                    href={buildHref(link.clickHref ?? '', srcQrId)}
                    rel="noopener nofollow"
                    className={commonClass}
                    style={commonStyle}
                  >
                    {content}
                  </a>
                ) : (
                  <div
                    role="link"
                    aria-disabled="true"
                    className={commonClass}
                    style={commonStyle}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <footer className={`mt-10 text-xs ${mutedText}`}>
          <a
            href="/"
            rel="noopener"
            className="hover:underline underline-offset-4"
          >
            Made with andmore
          </a>
        </footer>
      </div>
    </div>
  );
}

function deriveInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildHref(clickHref: string, srcQrId?: string | null): string {
  if (!srcQrId) return clickHref;
  const separator = clickHref.includes('?') ? '&' : '?';
  return `${clickHref}${separator}src=${encodeURIComponent(srcQrId)}`;
}
