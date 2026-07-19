export interface LinkPreviewSnapshot {
  url: string;
  canonical_url?: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}
export function firstUrlInText(text: string | null | undefined): string | null;
export function isBlockedAddress(ip: string): boolean;
export function isAllowedPreviewUrl(url: string): boolean;
export function parseOpenGraph(html: string, baseUrl: string): LinkPreviewSnapshot | null;
export function sanitizeLinkPreview(obj: unknown): LinkPreviewSnapshot | null;
