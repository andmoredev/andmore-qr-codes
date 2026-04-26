import { useMemo } from 'react';
import { iconForLink } from '../publicPageIcons';
import {
  accentStyle,
  buildHref,
  deriveInitials,
  sortLinks,
  type PageTemplateProps,
} from './shared';

/**
 * Classic template — the original look. Centered column, avatar on top,
 * stacked outline buttons. Kept as the default for existing pages.
 */
export function ClassicTemplate({ page, interactive = true, srcQrId }: PageTemplateProps) {
  const displayName = page.displayName ?? '';
  const bio = page.bio ?? '';
  const theme = page.theme ?? 'dark';
  const accent = page.accentColor || '#22C55E';
  const initials = useMemo(() => deriveInitials(displayName), [displayName]);
  const links = useMemo(() => sortLinks(page.links), [page.links]);

  const isDark = theme === 'dark';
  const wrapperTheme = isDark ? 'bg-[#0F172A] text-[#F8FAFC]' : 'bg-[#F8FAFC] text-[#0F172A]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#475569]';
  const avatarRing = isDark ? 'ring-[#1E293B]' : 'ring-white';
  const avatarFallbackBg = isDark ? 'bg-[#1E293B]' : 'bg-white';
  const linkBase = isDark ? 'bg-[#1E293B]/60 border-[#334155]' : 'bg-white border-[#E2E8F0]';
  const linkHover = interactive
    ? isDark
      ? 'hover:bg-[#1E293B] hover:-translate-y-0.5'
      : 'hover:bg-[#F1F5F9] hover:-translate-y-0.5'
    : '';

  const minHeightClass = interactive ? 'min-h-screen' : 'min-h-full';

  return (
    <div
      className={`${minHeightClass} w-full flex flex-col items-center px-4 py-10 sm:py-14 ${wrapperTheme}`}
      style={accentStyle(accent)}
      data-theme={theme}
      data-template="classic"
    >
      <div className="w-full max-w-[480px] flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-4 motion-safe:animate-fade-up">
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
          {links.map((link, i) => {
            const Icon = iconForLink(link.kind, link.icon);
            const label = link.label || 'Untitled link';
            const commonClass = `group flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border transition-all duration-200 motion-safe:animate-fade-up ${linkBase} ${linkHover}`;
            const commonStyle = {
              borderColor: 'var(--accent)',
              animationDelay: `${80 + i * 60}ms`,
            };
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
          <a href="/" rel="noopener" className="hover:underline underline-offset-4">
            Made with andmore
          </a>
        </footer>
      </div>
    </div>
  );
}
