import {
  Github,
  Globe,
  Link2,
  Linkedin,
  LucideIcon,
  Twitter,
  Youtube,
} from 'lucide-react';
import type { LinkKind } from '../types';

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

/**
 * Resolve the Lucide icon for a Links Page link. Used by both the public
 * `/p/:slug` render and the editor's live preview so the two stay in sync.
 */
export function iconForLink(kind: LinkKind, customIcon?: string): LucideIcon {
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
      if (customIcon && CUSTOM_ICONS[customIcon]) return CUSTOM_ICONS[customIcon];
      return Link2;
  }
}
