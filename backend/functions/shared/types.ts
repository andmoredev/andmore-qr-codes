/**
 * Canonical entity types shared across backend handlers.
 * Keep `frontend/src/types/index.ts` in sync when this changes.
 */

export type LinkKind = 'x' | 'linkedin' | 'youtube' | 'github' | 'blog' | 'custom';

export interface LinkItem {
  linkKey: string;      // stable id within the page, used for click events
  kind: LinkKind;
  label: string;
  url: string;
  icon?: string;        // lucide icon name when kind === 'custom'
  order: number;
}

export type Theme = 'light' | 'dark';

export interface LinkPage {
  pageId: string;
  userId: string;
  slug: string;
  displayName: string;
  bio: string;
  avatarKey?: string;
  theme: Theme;
  accentColor: string;  // hex, e.g. '#22C55E'
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
  destinationUrl?: string;  // direct QRs only
  pageId?: string;          // page-backed QRs only
  logoKey?: string;
  qrCodeKey: string;
  enabled: boolean;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface VersionMeta {
  version: number;
  versionedAt: string;
  note?: string;
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';

export interface ScanEvent {
  qrId: string;
  eventId: string;
  ts: string;               // ISO8601
  country?: string;         // ISO-3166 alpha-2
  deviceType: DeviceType;
  referrer?: string;
  uaHash: string;
  ipHash: string;
}

export interface ClickEvent {
  qrId: string;
  linkKey: string;
  eventId: string;
  ts: string;
  country?: string;
  deviceType: DeviceType;
  referrer?: string;
  uaHash: string;
  ipHash: string;
}

export interface AnalyticsBucket {
  bucket: string;           // ISO date, e.g. '2026-04-20' for day buckets
  count: number;
}

export interface AnalyticsSummary {
  qrId: string;
  totalScans: number;
  totalClicks: number;
  byDay: AnalyticsBucket[];
  byCountry: Array<{ country: string; count: number }>;
  byDevice: Array<{ deviceType: DeviceType; count: number }>;
  byLink?: Array<{ linkKey: string; count: number }>;
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
}

export interface PublicPage {
  slug: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  theme: Theme;
  accentColor: string;
  links: Array<{
    linkKey: string;
    kind: LinkKind;
    label: string;
    icon?: string;
    clickHref: string;      // `/l/{clickId}` URL for tracking
  }>;
}
