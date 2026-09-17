type MatchInput = {
  request: { destination?: string; mode?: string };
  url: URL;
  sameOrigin?: boolean;
};

export function manualChunkFor(id: string): string | undefined;
export function chunkFileNameFor(chunk: { facadeModuleId: string | null }): string;
export const PRECACHE_GLOB_PATTERNS: string[];
export const PRECACHE_GLOB_IGNORES: string[];
export const NAVIGATE_FALLBACK_DENYLIST: RegExp[];
export const isHashedAsset: (input: Pick<MatchInput, 'url' | 'sameOrigin'>) => boolean;
export const isFontRequest: (input: Pick<MatchInput, 'url' | 'sameOrigin'>) => boolean;
export const isAgentPhotoImage: (input: MatchInput) => boolean;
export const isHotelMediaImage: (input: MatchInput) => boolean;
export const isSameOriginImage: (input: MatchInput) => boolean;
export const isNavigationRequest: (input: Pick<MatchInput, 'request'>) => boolean;
