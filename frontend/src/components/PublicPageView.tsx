import { CSSProperties, useMemo } from 'react';
import {
  Github,
  Globe,
  Link2,
  Linkedin,
  LucideIcon,
  Twitter,
  Youtube,
} from 'lucide-react';
import type { LinkKind, PublicPage } from '../types';

interface Props {
  page: PublicPage;
  /** QR id that attributed this scan. Passed through to every outbound click. */
  srcQrId?: string | null;
}

/**
 * Pure-presentational renderer for a published Links Page.
 *
 * This component is shared between the live preview inside the Links Page editor
 * and the public `/p/:slug` route. It takes a `PublicPage` shape and renders it
 * verbatim — no fetching, no routing, no auth.
 *
 * Light / dark theme is driven by the `theme` field on the page and applied via
 * local Tailwind classes on the outer wrapper so the public page can render
 * independently of the app's dark-only theme tokens.
 */
export function PublicPageView({ page, srcQrId }: Props) {
  const initials = useMemo(() => deriveInitials(page.displayName), [page.displayName]);
  // The API already sorts by `order`. Be defensive: if the consumer (e.g. the
  // live preview in the editor) passes an unsorted list that happens to carry
  // `order`, respect it; otherwise preserve the incoming order.
  const sortedLinks = useMemo(() => {
    const arr = [...page.links];
    const anyHasOrder = arr.some(l => typeof (l as { order?: number }).order === 'number');
    if (!anyHasOrder) return arr;
    return arr.sort(
      (a, b) =>
        ((a as { order?: number }).order ?? 0) -
        ((b as { order?: number }).order ?? 0)
    );
  }, [page.links]);

  const isDark = page.theme === 'dark';
  const accent = page.accentColor || '#22C55E';

  // Expose the accent color as a CSS variable so Tailwind's arbitrary values
  // (e.g. `border-[color:var(--accent)]`) pick it up.
  const rootStyle: CSSProperties = { ['--accent' as string]: accent };

  const wrapperTheme = isDark
    ? 'bg-[#0F172A] text-[#F8FAFC]'
    : 'bg-[#F8FAFC] text-[#0F172A]';

  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#475569]';
  const avatarRing = isDark ? 'ring-[#1E293B]' : 'ring-white';
  const avatarFallbackBg = isDark ? 'bg-[#1E293B]' : 'bg-white';

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center px-4 py-10 sm:py-14 ${wrapperTheme}`}
      style={rootStyle}
      data-theme={page.theme}
    >
      <div className="w-full max-w-[480px] flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-4">
          {page.avatarUrl ? (
            <img
              src={page.avatarUrl}
              alt={`${page.displayName} avatar`}
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
              {page.displayName}
            </h1>
            {page.bio ? (
              <p className={`text-sm sm:text-base leading-relaxed ${mutedText} break-words`}>
                {page.bio}
              </p>
            ) : null}
          </div>
        </div>

        <ul className="w-full flex flex-col gap-3 mt-2">
          {sortedLinks.map(link => {
            const Icon = iconForLink(link.kind, link.icon);
            const href = buildHref(link.clickHref, srcQrId);
            return (
              <li key={link.linkKey}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className={`group flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border transition-colors duration-150 ${
                    isDark
                      ? 'bg-[#1E293B]/60 border-[#334155] hover:bg-[#1E293B]'
                      : 'bg-white border-[#E2E8F0] hover:bg-[#F1F5F9]'
                  }`}
                  style={{
                    borderColor: 'var(--accent)',
                  }}
                >
                  <Icon
                    className="w-5 h-5 shrink-0"
                    style={{ color: 'var(--accent)' }}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span className="text-sm sm:text-base font-medium text-center flex-1 truncate">
                    {link.label}
                  </span>
                </a>
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

/**
 * Map for custom link icons: `icon` is a Lucide icon name supplied by the
 * page editor (pascal-cased — e.g. `Music`, `Spotify`). We keep this list
 * small and static to avoid pulling the entire Lucide bundle dynamically.
 */
const CUSTOM_ICONS: Record<string, LucideIcon> = {
  Globe,
  Link2,
  Github,
  Linkedin,
  Twitter,
  Youtube,
};

function iconForLink(kind: LinkKind, icon?: string): LucideIcon {
  switch (kind) {
    case 'x':
      return Twitter;
    case 'linkedin':
      return Linkedin;
    case 'youtube':
      return Youtube;
    case 'github':
      return Github;
    case 'blog':
      return Globe;
    case 'custom':
    default:
      if (icon && CUSTOM_ICONS[icon]) return CUSTOM_ICONS[icon];
      return Link2;
  }
}
