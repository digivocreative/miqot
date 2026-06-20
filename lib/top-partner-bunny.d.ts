import type { TopPartner } from './top-partner.js';

export interface TopPartnerBunnyFile {
  buffer: Buffer;
  contentType?: string;
}

export interface TopPartnerBunnyDeps {
  enabled?: boolean | (() => boolean);
  cdnHostname?: string;
  fileExists?: (path: string) => Promise<boolean>;
  downloadFile?: (url: string) => Promise<TopPartnerBunnyFile>;
  uploadFile?: (path: string, buffer: Buffer, contentType?: string) => Promise<void>;
  logger?: { warn?: (message: string) => void };
}

export function sanitizeBunnyPathPart(value: unknown): string;
export function buildTopPartnerBunnyPath(photoFile: unknown, version?: unknown): string;
export function buildTopPartnerCdnUrl(cdnHostname: unknown, photoFile: unknown, version?: unknown): string;
export function normalizeBunnyDownloadUrl(url: unknown): string;
export function mirrorTopPartnerPhoto<T extends Partial<TopPartner>>(partner: T, deps?: TopPartnerBunnyDeps): Promise<T>;
export function mirrorTopPartnerPhotos<T extends Partial<TopPartner>>(partners: T[], deps?: TopPartnerBunnyDeps): Promise<T[]>;
