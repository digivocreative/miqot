export const TERAS_SHORT_CODE_LEN: number;
export function terasShortCode(postId: string | null | undefined): string;
export function terasSharePath(postId: string | null | undefined): string;
export function terasShareUrl(postId: string | null | undefined, origin: string): string;
export function isTerasShortCode(value: unknown): boolean;
export function communityShortCodeBounds(code: string): { lo: string; hi: string };
