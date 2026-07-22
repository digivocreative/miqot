export type PrayerCityId = 'mekkah' | 'madinah';
export type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
export type PrayerTimings = Record<PrayerName, string>;

export const ALADHAN_METHOD: number;

export interface PrayerCity { id: PrayerCityId; label: string; latitude: number; longitude: number; }
export const PRAYER_CITIES: Record<PrayerCityId, PrayerCity>;
export const PRAYER_ORDER: readonly PrayerName[];
export const PRAYER_LABELS: Record<PrayerName, string>;
export const HIJRI_MONTHS_ID: readonly string[];

export interface RiyadhNow { dateKey: string; isoDate: string; minutesOfDay: number; }
export function getRiyadhNow(nowMs: number): RiyadhNow;

export function parseHHMM(value: unknown): number | null;
export function formatHHMM(value: unknown): string;

export interface NextPrayer { name: PrayerName; label: string; timeLabel: string; minutesUntil: number; tomorrow: boolean; }
export function computeNextPrayer(timings: Partial<PrayerTimings> | null | undefined, nowMinutes: number): NextPrayer | null;

export function formatCountdown(minutesUntil: number | null | undefined): string;

export interface AladhanHijri { day?: string | number; year?: string | number; month?: { number?: number; en?: string; ar?: string }; }
export function formatHijri(hijri: AladhanHijri | null | undefined): string | null;

export function buildTimingsUrl(cityId: PrayerCityId, dateKey: string): string;

// --- Ditambah di Task 2 ---
export function tripDayIndex(startIso: string | null | undefined, endIso: string | null | undefined, todayIso: string): number | null;
export interface ItineraryDayLike { location?: string | null; title?: string | null; }
export function resolvePrimaryCity(input?: { itineraryDays: ReadonlyArray<ItineraryDayLike>; dayIndex: number | null }): PrayerCityId;
