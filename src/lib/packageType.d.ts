/**
 * Deklarasi tipe untuk src/lib/packageType.js — satu sumber aturan "Tipe Paket"
 * yang dipakai halaman Brosur dan filter Tipe Paket di Jadwal publik.
 */

/** Shape minimal yang dibutuhkan predikat tipe paket. */
export interface PackageTypeSubject {
  /** Nama paket. Brosur mengirim nama ter-clean, Jadwal mengirim jadwal_nama mentah. */
  nama: string;
  isPromo: boolean;
  /** Tanggal keberangkatan, YYYY-MM-DD. */
  departureIso: string;
  /** Nama tier harga. `null` = TIDAK DIKETAHUI (respons brosur versi lama). */
  tiers: string[] | null;
}

export interface MusimDinginWindow {
  /** Tahun bulan Desember-nya; jendelanya Des(yearOfDec) + Jan(yearOfDec + 1). */
  yearOfDec: number;
}

export interface PackageTypeOption {
  value: string;
  label: string;
}

export const PACKAGE_TYPE_UMROH_SAJA: 'UMROH SAJA';
export const PACKAGE_TYPE_UMROH_RAHMAH: 'UMROH RAHMAH';
export const PACKAGE_TYPE_UMROH_PROMO: 'UMROH PROMO';
export const PACKAGE_TYPE_UMROH_MUSIM_DINGIN: 'UMROH MUSIM DINGIN';
export const PACKAGE_TYPE_KERETA_CEPAT: 'KERETA CEPAT';

export const PACKAGE_TYPES: ReadonlyArray<{ value: string; pattern: RegExp }>;
export const KERETA_CEPAT_PATTERN: RegExp;
export const TIER_FOR_PACKAGE_TYPE: Record<string, string>;

/** Satu tipe destinasi per paket (first-match-wins); default 'UMROH SAJA'. */
export function derivePackageType(rawName: string | undefined | null): string;
export function hasKeretaCepat(rawName: string | undefined | null): boolean;

/** Musim dingin terdekat relatif `today` (UTC). */
export function getMusimDinginWindow(today?: Date): MusimDinginWindow;
export function isMusimDinginDeparture(iso: string | undefined | null, musimDinginWindow: MusimDinginWindow): boolean;

export function matchesPackageType(
  subject: PackageTypeSubject | null | undefined,
  type: string,
  musimDinginWindow: MusimDinginWindow,
): boolean;

export function packageTypeLabel(type: string): string;
export function isPackageType(type: string | undefined | null): boolean;

/** Opsi urut kanonik, hanya tipe yang punya minimal satu paket cocok. */
export function listPackageTypeOptions(
  subjects: ReadonlyArray<PackageTypeSubject>,
  musimDinginWindow: MusimDinginWindow,
): PackageTypeOption[];

export function packageTypeSlug(type: string): string;
export function packageTypeFromSlug(slug: string | undefined | null): string | null;

/** Adapter: BrochurePackage → subject. */
export function brochureTypeSubject(pkg: unknown): PackageTypeSubject;
/** Adapter: UmrohPackage → subject. */
export function umrohTypeSubject(pkg: unknown): PackageTypeSubject;
