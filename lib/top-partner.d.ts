export interface TopPartner {
  id: string;
  name: string;
  phone: string;
  waLink: string;
  photo: string;
  photoFile: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  website: string;
}

export const TOP_PARTNER_ENDPOINT: string;
export const TOP_PARTNER_ENDPOINTS: readonly string[];
export const TOP_PARTNER_REFRESH_INTERVAL_MS: number;
export const TOP_PARTNER_PHOTO_PROXY_BASE: string;
export const TOP_PARTNER_WHATSAPP_TEXT: string;
export const TOP_PARTNER_META_TITLE: string;
export const TOP_PARTNER_META_DESCRIPTION: string;
export const TOP_PARTNER_OG_IMAGE_PATH: string;

export function normalizeWaNumber(raw: unknown): string;
export function firstValidUrl(raw: unknown, options?: { rejectMaps?: boolean }): string;
export function buildPhotoProxyUrl(file: unknown): string;
export function buildWaLink(phone: unknown): string;
export function sanitizePartnerRow(row: unknown): TopPartner;
export function sanitizePartnerRows(rows: unknown): TopPartner[];
export function isTopPartnerCacheFresh(syncedAt: unknown, now?: number, maxAgeMs?: number): boolean;
export function fetchTopPartnerData(options?: {
  fetchImpl?: typeof fetch;
  endpoints?: string[];
  timeoutMs?: number;
  headers?: Record<string, string>;
}): Promise<{ partners: TopPartner[]; endpoint: string }>;
export function shufflePartners<T>(partners: T[], random?: () => number): T[];
