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
 * Marquee template — bold, animated, maximalist. Animated accent gradient
 * background, pulsing avatar ring, button-style links with a shimmer on hover.
 * If a banner image is provided it overlays the gradient as a soft photo backdrop.
 */
export function MarqueeTemplate({ page, interactive = true, srcQrId }: PageTemplateProps) {
  const displayName = page.displayName ?? '';
  const bio = page.bio ?? '';
  const theme = page.theme ?? 'dark';
  const accent = page.accentColor || '#22C55E';
  const initials = useMemo(() => deriveInitials(displayName), [displayName]);
  const links = useMemo(() => sortLinks(page.links), [page.links]);

  const isDark = theme === 'dark';
  const baseBg = isDark ? '#06070C' : '#FAFAFA';
  const fg = isDark ? '#FFFFFF' : '#0F172A';
  const mutedText = isDark ? 'text-white/65' : 'text-black/55';

  const minHeightClass = interactive ? 'min-h-screen' : 'min-h-full';

  // Animated accent gradient. The Tailwind `animate-gradient-shift` keyframes
  // sweep background-position so the colors drift slowly.
  const gradientStyle = {
    background: `linear-gradient(135deg, ${accent} 0%, ${baseBg} 35%, ${baseBg} 65%, ${accent} 100%)`,
    backgroundSize: '200% 200%',
  };

  // Optional banner overlays the gradient with low opacity for texture.
  const bannerOverlay = page.bannerUrl
    ? {
        backgroundImage: `url(${page.bannerUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.18,
      }
    : null;

  return (
    <div
      className={`${minHeightClass} relative w-full overflow-hidden`}
      style={{ ...accentStyle(accent), backgroundColor: baseBg, color: fg }}
      data-theme={theme}
      data-template="marquee"
    >
      {/* Animated gradient layer */}
      <div
        className="absolute inset-0 motion-safe:animate-gradient-shift"
        style={gradientStyle}
        aria-hidden="true"
      />
      {bannerOverlay ? (
        <div className="absolute inset-0 mix-blend-overlay" style={bannerOverlay} aria-hidden="true" />
      ) : null}
      {/* Vignette for legibility */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? 'radial-gradient(120% 90% at 50% 30%, transparent 30%, rgba(6,7,12,0.85) 100%)'
            : 'radial-gradient(120% 90% at 50% 30%, transparent 30%, rgba(250,250,250,0.85) 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative w-full flex flex-col items-center px-4 py-14 sm:py-20">
        <div className="w-full max-w-[520px] flex flex-col items-center">
          <div className="relative motion-safe:animate-fade-up">
            <div
              className="absolute inset-0 rounded-full motion-safe:animate-pulse-glow"
              style={{ boxShadow: '0 0 0 0 var(--accent)' }}
              aria-hidden="true"
            />
            {page.avatarUrl ? (
              <img
                src={page.avatarUrl}
                alt={`${displayName} avatar`}
                width={128}
                height={128}
                className="relative w-32 h-32 rounded-full object-cover ring-2"
                style={{ ['--tw-ring-color' as string]: accent }}
              />
            ) : (
              <div
                className="relative w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold ring-2"
                style={{
                  backgroundColor: accent,
                  color: baseBg,
                  ['--tw-ring-color' as string]: accent,
                }}
                aria-hidden="true"
              >
                {initials}
              </div>
            )}
          </div>

          <h1
            className="mt-6 text-4xl sm:text-5xl font-bold tracking-tighter text-center break-words motion-safe:animate-fade-up"
            style={{ animationDelay: '60ms' }}
          >
            {displayName || 'Your name'}
          </h1>
          {bio ? (
            <p
              className={`mt-3 text-base leading-relaxed text-center max-w-md ${mutedText} break-words motion-safe:animate-fade-up`}
              style={{ animationDelay: '120ms' }}
            >
              {bio}
            </p>
          ) : null}

          <ul className="w-full mt-10 flex flex-col gap-3">
            {links.map((link, i) => {
              const Icon = iconForLink(link.kind, link.icon);
              const label = link.label || 'Untitled link';
              const commonClass = `group relative overflow-hidden flex items-center gap-3 w-full px-5 py-4 rounded-2xl font-semibold transition-transform duration-200 motion-safe:animate-fade-up ${interactive ? 'hover:scale-[1.02] active:scale-[0.99]' : ''}`;
              const commonStyle = {
                backgroundColor: accent,
                color: baseBg,
                animationDelay: `${180 + i * 60}ms`,
              };
              const content = (
                <>
                  {/* Shimmer overlay on hover (interactive only) */}
                  {interactive ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 -inset-x-1/4 motion-safe:group-hover:animate-shimmer"
                      style={{
                        background:
                          'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)',
                        transform: 'translateX(-120%)',
                      }}
                    />
                  ) : null}
                  <span
                    className="relative w-8 h-8 shrink-0 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                  >
                    <Icon className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  <span className="relative flex-1 truncate text-base">{label}</span>
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

          <footer className={`mt-14 text-xs ${mutedText}`}>
            <a href="/" rel="noopener" className="hover:underline underline-offset-4">
              Made with andmore
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}
