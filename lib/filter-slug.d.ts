export interface ResolvedFilterSlug {
  mode: string;
  secondaryValue?: string;
}

export const MONTH_NAMES_ID: readonly string[];
export const LANDING_FILTER_CODES: readonly string[];
export const FILTER_MODE_SLUGS: Record<string, string>;
export const FILTER_MODE_LABELS: Record<string, string>;
export const SLUG_TO_FILTER_MODE: Record<string, string>;
export const LEGACY_FILTER_SLUGS: Record<string, ResolvedFilterSlug>;

export function landingCityName(code: string): string;

/** Sub-nilai filter "AWAL PERJALANAN", urutan tampilnya: UMROH, MADINAH, TOUR. */
export const JOURNEY_START_FILTER_VALUES: readonly string[];
/** 'MADINAH' → 'Madinah' */
export function journeyStartLabel(value: string): string;
export function filterModeLabel(mode: string): string;
export function getFilterSlug(mode: string): string;
export function buildFilterSlug(mode: string, secondaryValue?: string): string;
export function resolveFilterSlug(slug: string): ResolvedFilterSlug | null;
export function getFilterModeFromSlug(slug: string): string | null;
