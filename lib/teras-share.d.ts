export const TERAS_SHORT_CODE_LEN: number;
export function terasShortCode(postId: string | null | undefined): string;
export function terasSharePath(postId: string | null | undefined): string;
export function terasShareUrl(postId: string | null | undefined, origin: string): string;
export function isTerasShortCode(value: unknown): boolean;
export const TERAS_PREVIEW_EXCERPT_LEN: number;
export function terasPreviewExcerpt(body: string | null | undefined, maxLength?: number): string;
export function communityShortCodeBounds(code: string): { lo: string; hi: string };
