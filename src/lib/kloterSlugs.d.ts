import type { KloterTrip } from './kloterLanding.js';

export type KloterSubPage = 'doa' | 'dzikir' | 'itinerary' | 'room-list';

export const KLOTER_SLUGS: string[];
export function resolveKloterSlug(segment: string | null | undefined): string | null;
export const KLOTER_SUB_PAGES: KloterSubPage[];
export function resolveKloterSubPage(segment: string | null | undefined): KloterSubPage | null;
export function loadKloterTrip(segment: string): Promise<KloterTrip>;
