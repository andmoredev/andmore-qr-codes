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
 * Spotlight template — banner image fills the top, avatar overlaps the
 * lower edge, large headline, and translucent card-style links. If no
 * banner is uploaded, falls back to a soft accent gradient.
 */
export function SpotlightTemplate({ page, interactive = true, srcQrId }: PageTemplateProps) {
  const displayName = page.displayName ?? '';
  const bio = page.bio ?? '';
  const theme = page.theme ?? 'dark';
  const accent = page.accentColor || '#22C55E';
  const initials = useMemo(() => deriveInitials(displayName), [displayName]);
  const links = useMemo(() => sortLinks(page.links), [page.links]);

  const isDark = theme === 'dark';
  const wrapperTheme = isDark ? 'bg-[#0B1120] text-[#F8FAFC]' : 'bg-[#F1F5F9] text-[#0F172A]';
  const cardBase = isDark
    ? 'bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/30'
    : 'bg-white/80 border-black/5 backdrop-blur-sm hover:bg-white hover:border-black/10';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#475569]';
  const avatarRing = isDark ? 'ring-[#0B1120]' : 'ring-white';

  const minHeightClass = interactive ? 'min-h-screen' : 'min-h-full';

  // Banner backdrop: image if provided, otherwise an accent gradient.
  const bannerStyle = page.bannerUrl
    ? { backgroundImage: `url(${page.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {
        backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${accent}66 0%, transparent 60%), linear-gradient(180deg, ${accent}1A 0%, transparent 70%)`,
      };

  // Overlay gradient ensures legibility regardless of banner contents.
  const overlay = isDark
    ? 'linear-gradient(180deg, rgba(11,17,32,0.0) 0%, rgba(11,17,32,0.55) 65%, rgba(11,17,32,1) 100%)'
    : 'linear-gradient(180deg, rgba(241,245,249,0.0) 0%, rgba(241,245,249,0.55) 65%, rgba(241,245,249,1) 100%)';

  return (
    <div
      className={`${minHeightClass} w-full ${wrapperTheme}`}
      style={accentStyle(accent)}
      data-theme={theme}
      data-template="spotlight"
    >
      {/* Banner */}
      <div className="relative w-full h-56 sm:h-72" style={bannerStyle}>
        <div className="absolute inset-0" style={{ backgroundImage: overlay }} />
      </div>

      <div className="relative w-full flex flex-col items-center px-4 -mt-16 sm:-mt-20 pb-14">
        <div className="w-full max-w-[520px] flex flex-col items-center">
          <div className="motion-safe:animate-fade-up">
            {page.avatarUrl ? (
              <img
                src={page.avatarUrl}
                alt={`${displayName} avatar`}
                width={128}
                height={128}
                className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover ring-4 shadow-xl ${avatarRing}`}
              />
            ) : (
              <div
                className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center text-3xl font-semibold ring-4 shadow-xl ${avatarRing}`}
                style={{ backgroundColor: 'var(--accent)', color: '#0B1120' }}
                aria-hidden="true"
              >
                {initials}
              </div>
            )}
          </div>

          <h1
            className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight text-center break-words motion-safe:animate-fade-up"
            style={{ animationDelay: '60ms' }}
          >
            {displayName || 'Your name'}
          </h1>
          {bio ? (
            <p
              className={`mt-2 text-sm sm:text-base leading-relaxed text-center max-w-md ${mutedText} break-words motion-safe:animate-fade-up`}
              style={{ animationDelay: '120ms' }}
            >
              {bio}
            </p>
          ) : null}

          <ul className="w-full mt-8 flex flex-col gap-3">
            {links.map((link, i) => {
              const Icon = iconForLink(link.kind, link.icon);
              const label = link.label || 'Untitled link';
              const commonClass = `group relative flex items-center gap-3 w-full px-4 py-4 rounded-xl border transition-all duration-200 motion-safe:animate-fade-up ${cardBase} ${interactive ? 'hover:-translate-y-0.5 hover:shadow-lg' : ''}`;
              const commonStyle = { animationDelay: `${180 + i * 60}ms` };
              const content = (
                <>
                  <span
                    className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
                  >
                    <Icon
                      className="w-4.5 h-4.5"
                      style={{ color: 'var(--accent)' }}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-sm sm:text-base font-medium flex-1 truncate">
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
                    <div role="link" aria-disabled="true" className={commonClass} style={commonStyle}>
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <footer className={`mt-12 text-xs ${mutedText}`}>
            <a href="/" rel="noopener" className="hover:underline underline-offset-4">
              Made with andmore
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}
