export interface BrochureHotelInfo {
  city: string;
  name: string;
  stars: number | null;
}

export interface BrochureTierInfo {
  /** Nama tier apa adanya dari AWAPI (HEMAT / UHUD / RAHMAH). */
  tier: string;
  harga: number;
  /** Tipe kamar yang harganya dipakai (Quard / Triple / Double). */
  room: string;
  hotel: BrochureHotelInfo[];
}

export interface BrochurePackageDetails {
  harga: number;
  tier: string;
  room: string;
  hotel: BrochureHotelInfo[];
}

export interface BrochureMonthGroup<T> {
  key: string;
  label: string;
  monthIndexId: number;
  year: number;
  packages: T[];
  truncatedCount: number;
}

export function pickBrochureHotels(paket_hotel: unknown, tierName: string | null | undefined): BrochureHotelInfo[];
export function listBrochureTiers(paket_harga: unknown, paket_hotel: unknown): BrochureTierInfo[];
export function pickBrochurePackageDetails(paket_harga: unknown, paket_hotel: unknown): BrochurePackageDetails | null;
export function pickBrochurePrice(paket_harga: unknown): number | null;
export function pickBrochurePriceRoom(paket_harga: unknown): string | null;

/** true/false bila `tiers` diketahui; null bila belum dikirim backend. */
export function brochurePackageSellsTier(
  pkg: { tiers?: BrochureTierInfo[] | null } | null | undefined,
  tierName: string | null | undefined,
): boolean | null;

export function projectBrochurePackageToTier<T extends { tiers?: BrochureTierInfo[] | null }>(
  pkg: T,
  tierName: string | null | undefined,
): T;

export function cleanBrochurePackageName(name: string | null | undefined): string;
export function isWaitingListPackageName(name: string | null | undefined): boolean;
export function countBrochureTripDays(berangkat_tgl: string | null | undefined, pulang_tgl: string | null | undefined): number | null;
export function extractDurationFromName(rawName: string | null | undefined): number | null;
export function isUmrohFirstRoute(berangkatRute: string | null | undefined, pulangRute?: string | null): boolean;
export function landingCityFromRoute(berangkatRute: string | null | undefined): string;
export function parseSeatSisa(value: unknown): number | null;
export function groupPackagesByMonth<T extends { berangkat_tgl: string }>(
  packages: T[],
  today: Date,
  monthsAhead: number,
): Array<BrochureMonthGroup<T>>;
