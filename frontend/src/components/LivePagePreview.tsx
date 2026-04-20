import { ComponentType } from 'react';
import {
  Twitter,
  Linkedin,
  Youtube,
  Github,
  Globe,
  Link2,
  User,
  LucideIcon,
  LucideProps,
  icons as lucideIcons,
} from 'lucide-react';
import type { LinkKind, Theme } from '../types';

export interface LivePreviewLink {
  linkKey: string;
  kind: LinkKind;
  label: string;
  url?: string;
  icon?: string;
}

interface Props {
  displayName: string;
  bio: string;
  avatarSrc?: string | null;
  theme: Theme;
  accentColor: string;
  links: LivePreviewLink[];
  /** If true, links are inert (preview mode). */
  inert?: boolean;
}

const kindIcon: Record<Exclude<LinkKind, 'custom'>, LucideIcon> = {
  x: Twitter,
  linkedin: Linkedin,
  youtube: Youtube,
  github: Github,
  blog: Globe,
};

function resolveIcon(kind: LinkKind, iconName?: string): ComponentType<LucideProps> {
  if (kind !== 'custom') return kindIcon[kind];
  if (iconName && iconName in lucideIcons) {
    return lucideIcons[iconName as keyof typeof lucideIcons] as ComponentType<LucideProps>;
  }
  return Link2;
}

export function LivePagePreview({
  displayName,
  bio,
  avatarSrc,
  theme,
  accentColor,
  links,
  inert = true,
}: Props) {
  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-[#0B1120]' : 'bg-[#F8FAFC]';
  const textClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const subTextClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'bg-slate-900/60' : 'bg-white';
  const cardBorder = isDark ? 'border-slate-700' : 'border-slate-200';
  const cardHover = isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50';

  // Caller is responsible for passing links in their display order.
  const ordered = links;

  return (
    <div
      className={`${bgClass} ${textClass} min-h-full w-full rounded-xl border border-border overflow-hidden`}
    >
      <div className="max-w-sm mx-auto px-6 py-10 flex flex-col items-center gap-4">
        <div
          className="w-20 h-20 rounded-full border-2 flex items-center justify-center overflow-hidden"
          style={{ borderColor: accentColor }}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt={`${displayName} avatar`} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <User className={`w-8 h-8 ${subTextClass}`} />
            </div>
          )}
        </div>

        <div className="text-center">
          <h1 className="text-lg font-semibold">{displayName || 'Your name'}</h1>
          {bio && <p className={`text-sm mt-1 ${subTextClass}`}>{bio}</p>}
        </div>

        <div className="w-full flex flex-col gap-2.5 mt-2">
          {ordered.length === 0 && (
            <p className={`text-sm text-center py-6 ${subTextClass}`}>No links yet</p>
          )}
          {ordered.map((link) => {
            const Icon = resolveIcon(link.kind, link.icon);
            const content = (
              <>
                <Icon className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                <span className="flex-1 text-sm font-medium truncate">
                  {link.label || 'Untitled link'}
                </span>
              </>
            );
            const commonClass = `w-full flex items-center gap-3 px-4 py-3 rounded-lg border ${cardBorder} ${cardBg} ${cardHover} transition-colors duration-150`;
            if (inert || !link.url) {
              return (
                <div key={link.linkKey} className={commonClass} aria-disabled>
                  {content}
                </div>
              );
            }
            return (
              <a
                key={link.linkKey}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${commonClass} cursor-pointer`}
              >
                {content}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
