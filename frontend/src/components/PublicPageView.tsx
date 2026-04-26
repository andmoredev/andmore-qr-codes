import type { LinkKind, PageTemplate, PublicPage, Theme } from '../types';
import { ClassicTemplate } from './page-templates/ClassicTemplate';
import { SpotlightTemplate } from './page-templates/SpotlightTemplate';
import { MarqueeTemplate } from './page-templates/MarqueeTemplate';

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
  bannerUrl?: string | null;
  theme?: Theme;
  template?: PageTemplate;
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
 * Pure-presentational dispatcher. Picks a template implementation based on
 * `page.template` and delegates rendering. Each template is a self-contained
 * layout — they share helpers via `./page-templates/shared.ts` but otherwise
 * own their visual language.
 */
export function PublicPageView({ page, interactive = true, srcQrId }: Props) {
  const template: PageTemplate = page.template ?? 'classic';
  const props = { page, interactive, srcQrId };

  switch (template) {
    case 'spotlight':
      return <SpotlightTemplate {...props} />;
    case 'marquee':
      return <MarqueeTemplate {...props} />;
    case 'classic':
    default:
      return <ClassicTemplate {...props} />;
  }
}
