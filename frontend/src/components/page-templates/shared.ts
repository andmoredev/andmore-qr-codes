import type { CSSProperties } from 'react';
import type { LinkKind, PageTemplate, Theme } from '../../types';

export interface PageTemplateLink {
  linkKey: string;
  kind: LinkKind;
  label?: string;
  icon?: string;
  clickHref?: string;
  order?: number;
}

export interface PageTemplateModel {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  theme?: Theme;
  template?: PageTemplate;
  accentColor?: string;
  links?: PageTemplateLink[];
}

export interface PageTemplateProps {
  page: PageTemplateModel;
  /** When false, links render as non-interactive `<div role="link">`. */
  interactive?: boolean;
  /** QR id that attributed this scan; appended as `?src=` to outbound clicks. */
  srcQrId?: string | null;
}

export function deriveInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function buildHref(clickHref: string, srcQrId?: string | null): string {
  if (!srcQrId) return clickHref;
  const sep = clickHref.includes('?') ? '&' : '?';
  return `${clickHref}${sep}src=${encodeURIComponent(srcQrId)}`;
}

export function sortLinks(links: PageTemplateLink[] | undefined): PageTemplateLink[] {
  const arr = [...(links ?? [])];
  const anyOrdered = arr.some((l) => typeof l.order === 'number');
  if (!anyOrdered) return arr;
  return arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function accentStyle(accent: string): CSSProperties {
  return { ['--accent' as string]: accent };
}
