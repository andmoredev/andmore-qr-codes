/**
 * Mirrors backend/functions/shared/types.ts.
 * Keep in sync when the backend shapes change.
 */

export type LinkKind = 'x' | 'linkedin' | 'youtube' | 'github' | 'blog' | 'custom';

export interface LinkItem {
  linkKey: string;
  kind: LinkKind;
  label: string;
  url: string;
  icon?: string;
  order: number;
}

export type Theme = 'light' | 'dark';

export interface LinkPage {
  pageId: string;
  userId: string;
  slug: string;
  displayName: string;
  bio: string;
  avatarUrl?: string | null;
  theme: Theme;
  accentColor: string;
  links: LinkItem[];
  status: 'draft' | 'published';
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type QrType = 'direct' | 'page';

export interface QrCode {
  qrId: string;
  userId: string;
  name: string;
  type: QrType;
  destinationUrl?: string | null;
  pageId?: string | null;
  qrCodeUrl: string;
  logoUrl?: string | null;
  enabled: boolean;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface VersionMeta {
  version: number;
  versionedAt: string;
  note?: string | null;
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';

export interface AnalyticsBucket {
  bucket: string;
  count: number;
}

export interface AnalyticsSummary {
  qrId: string;
  totalScans: number;
  totalClicks: number;
  byDay: AnalyticsBucket[];
  byCountry: Array<{ country: string; count: number }>;
  byDevice: Array<{ deviceType: DeviceType; count: number }>;
  byLink?: Array<{ linkKey: string; label: string; count: number }>;
}

export interface DashboardSummary {
  totalQrs: number;
  totalPages: number;
  scansLast30Days: number;
  clicksLast30Days: number;
  recentQrs: Array<Pick<QrCode, 'qrId' | 'name' | 'type' | 'updatedAt'>>;
  recentPages: Array<Pick<LinkPage, 'pageId' | 'slug' | 'displayName' | 'status' | 'updatedAt'>>;
  scansByDay: AnalyticsBucket[];
  byCountry: Array<{ country: string; count: number }>;
  byDevice: Array<{ deviceType: DeviceType; count: number }>;
}

export interface PublicPage {
  slug: string;
  displayName: string;
  bio: string;
  avatarUrl?: string | null;
  theme: Theme;
  accentColor: string;
  links: Array<{
    linkKey: string;
    kind: LinkKind;
    label: string;
    icon?: string;
    clickHref: string;
  }>;
}

export interface CreateQrRequest {
  name: string;
  type: QrType;
  destinationUrl?: string;
  pageId?: string;
  logoBase64?: string;
}

export interface UpdateQrRequest {
  name?: string;
  destinationUrl?: string;
  pageId?: string;
  logoBase64?: string | null;
  enabled?: boolean;
}

export interface CreatePageRequest {
  slug: string;
  displayName: string;
  bio?: string;
  theme?: Theme;
  accentColor?: string;
  links?: LinkItem[];
}

export interface UpdatePageRequest {
  slug?: string;
  displayName?: string;
  bio?: string;
  avatarBase64?: string | null;
  theme?: Theme;
  accentColor?: string;
  links?: LinkItem[];
}
