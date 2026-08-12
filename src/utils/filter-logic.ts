/**
 * Filter Logic Utilities for Umroh Packages
 * Handles filtering, grouping, and data extraction
 */

import type { UmrohPackage } from '@/types';
import { calculateDuration } from '@/services/data-service';
import { getLandingAirportCode, getLandingCityName } from './journey';
import {
  getMusimDinginWindow,
  matchesPackageType,
  umrohTypeSubject,
  PACKAGE_TYPE_UMROH_MUSIM_DINGIN,
  PACKAGE_TYPE_UMROH_PROMO,
  PACKAGE_TYPE_UMROH_RAHMAH,
  PACKAGE_TYPE_UMROH_SAJA,
} from '@/lib/packageType';

// ============================================
// Types
// ============================================

/**
 * Mode filter halaman jadwal publik.
 *
 * 'LIBURAN_SEKOLAH' dan 'UMROH CUTI 5 HARI' sengaja TIDAK ada di dropdown
 * (FILTER_MODE_OPTIONS) tapi tetap hidup di sini: slug-nya sudah tersebar di
 * WhatsApp/iklan dan masih menyaring paket nyata. Menghapus slug-nya bukan cuma
 * menghilangkan filter — src/main.tsx memakai getFilterModeFromSlug sebagai
 * gerbang negatif, jadi URL yang tak dikenali dibaca sebagai ID paket dan
 * merender "Paket tidak ditemukan".
 */
export type FilterMode =
  | 'AVAILABLE'      // Filter paket dengan kursi tersedia
  | 'LANDING DI'     // Filter berdasarkan kota landing (Jeddah/Madinah/dll)
  | 'LIBURAN_SEKOLAH' // Filter keberangkatan Juni-Juli 2026 (URL saja)
  | 'UMROH CUTI 5 HARI' // Berangkat Jumat malam/Sabtu, pulang Sabtu/Minggu/Senin dini hari (URL saja)
  | 'TIPE PAKET'     // Filter berdasarkan tipe paket, roster sama dengan halaman Brosur
  | 'DURASI PERJALANAN' // Filter berdasarkan durasi
  | 'DATA PER-BULAN' // Filter berdasarkan bulan keberangkatan
  | 'SEMUA DATA';    // Tampilkan semua data

export type SortOrder = 
  | 'TANGGAL_TERDEKAT'
  | 'TANGGAL_TERJAUH'
  | 'HARGA_TERMURAH'
  | 'HARGA_TERTINGGI';

export interface FilterParams {
  mode: FilterMode;
  /** Secondary value: bulan (DATA PER-BULAN), durasi (DURASI PERJALANAN), kode kota landing (LANDING DI), atau tipe paket (TIPE PAKET) */
  secondaryValue?: string;
  /**
   * Titik acuan "sekarang" untuk tipe paket yang bergantung waktu (Umroh Musim
   * Dingin). Produksi membiarkannya kosong; ada supaya tes bisa deterministik —
   * jendela musim dingin bergeser tiap tahun, jadi tanpa ini tidak ada fixture
   * tanggal yang stabil.
   */
  today?: Date;
}

export interface MonthGroup {
  /** Month key for filtering (e.g., "2026-06") */
  monthKey: string;
  /** Display name in Indonesian (e.g., "Juni 2026") */
  monthName: string;
  /** Hijri month display (e.g., "Dzulhijjah 1447") */
  monthNameHijri?: string;
  /** Total seats across all packages in this month */
  totalSeat: number;
  /** Available seats across all packages in this month */
  availableSeat: number;
  /** Number of packages in this month */
  packageCount: number;
  /** List of packages in this month */
  packages: UmrohPackage[];
}

export interface LandingCity {
  /** City code extracted from route (e.g., "JED", "MED") */
  code: string;
  /** Full city name */
  name: string;
  /** Number of packages with this landing city */
  packageCount: number;
}

// ============================================
// Constants
// ============================================

/** Indonesian month names */
const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/** Hijri month names */
const HIJRI_MONTH_NAMES = [
  'Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir',
  'Jumadil Awal', 'Jumadil Akhir', 'Rajab', 'Syaban',
  'Ramadhan', 'Syawal', 'Dzulqaidah', 'Dzulhijjah'
];

// ============================================
// Filter Slug Mapping (for URL routing)
// ============================================

/** Map FilterMode to URL slug. AVAILABLE (default) has empty slug. */
export const FILTER_MODE_SLUGS: Record<FilterMode, string> = {
  'AVAILABLE': '',
  'LANDING DI': 'landing-di',
  'LIBURAN_SEKOLAH': 'liburan-sekolah',
  'UMROH CUTI 5 HARI': 'cuti-5-hari',
  'TIPE PAKET': 'tipe-paket',
  'DURASI PERJALANAN': 'durasi-perjalanan',
  'DATA PER-BULAN': 'data-per-bulan',
  'SEMUA DATA': 'semua-data',
};

/** Reverse map: slug → FilterMode */
export const SLUG_TO_FILTER_MODE: Record<string, FilterMode> = Object.fromEntries(
  Object.entries(FILTER_MODE_SLUGS)
    .filter(([, slug]) => slug !== '')
    .map(([mode, slug]) => [slug, mode as FilterMode])
) as Record<string, FilterMode>;

/**
 * Slug mode yang sudah dihapus → tipe paket terdekat di roster baru.
 *
 * JANGAN dihapus. Tautan `/umroh-promo`, `/{agent}/bintang-5`, dst. sudah
 * tersebar, dan src/main.tsx:417,424 memakai getFilterModeFromSlug sebagai
 * gerbang negatif: slug yang tak dikenal jatuh ke cabang detail paket dan
 * merender "Paket tidak ditemukan" dengan HTTP 200 — bukan 404, bukan redirect.
 *
 * 'bintang-5' → Umroh Rahmah karena RAHMAH itulah tier hotel bintang 5 di
 * kosakata Alhijaz (pill brosur "Hotel Bintang 5" dipicu token RAHMAH).
 */
export const LEGACY_FILTER_SLUGS: Record<string, { mode: FilterMode; secondaryValue?: string }> = {
  'umroh-promo': { mode: 'TIPE PAKET', secondaryValue: PACKAGE_TYPE_UMROH_PROMO },
  'umroh-musim-dingin': { mode: 'TIPE PAKET', secondaryValue: PACKAGE_TYPE_UMROH_MUSIM_DINGIN },
  'umroh-reguler': { mode: 'TIPE PAKET', secondaryValue: PACKAGE_TYPE_UMROH_SAJA },
  'bintang-5': { mode: 'TIPE PAKET', secondaryValue: PACKAGE_TYPE_UMROH_RAHMAH },
};

/** Mode yang memunculkan dropdown "Urutkan" — satu daftar untuk App & FilterHeader. */
export const MODES_WITH_SORT: readonly FilterMode[] = [
  'AVAILABLE',
  'LIBURAN_SEKOLAH',
  'UMROH CUTI 5 HARI',
];

/** Get URL slug for a FilterMode */
export function getFilterSlug(mode: FilterMode): string {
  return FILTER_MODE_SLUGS[mode] || '';
}

/** Slug URL → mode + sub-nilai bawaannya (slug lama membawa preset tipe paket). */
export function resolveFilterSlug(slug: string): { mode: FilterMode; secondaryValue?: string } | null {
  const key = String(slug || '').toLowerCase();
  const mode = SLUG_TO_FILTER_MODE[key];
  if (mode) return { mode };
  return LEGACY_FILTER_SLUGS[key] ?? null;
}

/** Get FilterMode from a URL slug. Returns null if not a valid filter slug. */
export function getFilterModeFromSlug(slug: string): FilterMode | null {
  return resolveFilterSlug(slug)?.mode ?? null;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract unique trip durations from packages
 */
export function extractUniqueDurations(packages: UmrohPackage[]): { days: number; label: string; count: number }[] {
  const durationMap = new Map<number, number>();
  packages.forEach(pkg => {
    const days = calculateDuration(pkg);
    durationMap.set(days, (durationMap.get(days) || 0) + 1);
  });
  return Array.from(durationMap.entries())
    .map(([days, count]) => ({ days, label: `${days} Hari`, count }))
    .sort((a, b) => a.days - b.days);
}

/**
 * Parse a YYYY-MM-DD string as a local date (not UTC).
 * new Date('YYYY-MM-DD') is parsed as UTC midnight by JS, which makes .getDay() shift a day in negative timezones.
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Check if a package qualifies for "UMROH CUTI 5 HARI":
 * - Departure: Friday >= 18:00, OR any time Saturday
 * - Return (landing in Indonesia): Saturday any time, OR Sunday any time, OR Monday < 06:00
 * Day codes: 0=Sun, 1=Mon, 5=Fri, 6=Sat
 */
function matchesCuti5Hari(pkg: UmrohPackage): boolean {
  const depDay = parseLocalDate(pkg.keberangkatan.tgl).getDay();
  const depHour = parseInt(pkg.keberangkatan.jam.split('.')[0], 10);

  const retDay = parseLocalDate(pkg.kepulangan.tgl).getDay();
  const retHour = parseInt(pkg.kepulangan.jam.split('.')[0], 10);

  const depOk = (depDay === 5 && depHour >= 18) || depDay === 6;
  const retOk = retDay === 6 || retDay === 0 || (retDay === 1 && retHour < 6);

  return depOk && retOk;
}

/**
 * Format date to month key (YYYY-MM)
 */
function getMonthKey(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Format month key to display name
 */
function formatMonthName(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const monthIndex = parseInt(month, 10) - 1;
  return `${MONTH_NAMES_ID[monthIndex]} ${year}`;
}

/**
 * Approximate Hijri date from Gregorian
 * Note: This is a simplified conversion, for demo purposes
 */
function approximateHijriMonth(dateStr: string): string {
  const date = new Date(dateStr);
  // Simple approximation: Hijri year ≈ Gregorian year - 579 + adjustment
  // The Islamic new year moves about 11 days earlier each Gregorian year
  const gregorianYear = date.getFullYear();
  const hijriYear = Math.floor(gregorianYear - 579 - (gregorianYear - 2000) * 0.03);
  
  // Approximate Hijri month (this is very rough)
  const gregorianMonth = date.getMonth();
  // Offset by about 5 months for current era (this is approximate)
  const hijriMonthIndex = (gregorianMonth + 5) % 12;
  
  return `${HIJRI_MONTH_NAMES[hijriMonthIndex]} ${hijriYear}`;
}

// ============================================
// Main Export Functions
// ============================================

/**
 * Extract unique landing cities from all packages.
 * Landing = arrival city of the departure flight's final leg (mis. Jeddah / Madinah).
 * Reuses the same logic as the package card (getLandingAirportCode/Name) so the
 * filter options match the "Landing di" yang ditampilkan tiap kartu.
 */
export function extractUniqueLandings(packages: UmrohPackage[]): LandingCity[] {
  const cityMap = new Map<string, { name: string; count: number }>();

  packages.forEach(pkg => {
    const code = getLandingAirportCode(pkg);
    const name = getLandingCityName(pkg);
    const existing = cityMap.get(code);
    if (existing) {
      existing.count += 1;
    } else {
      cityMap.set(code, { name, count: 1 });
    }
  });

  // Landing terbanyak di atas, lalu urut abjad nama kota
  return Array.from(cityMap.entries())
    .map(([code, data]) => ({ code, name: data.name, packageCount: data.count }))
    .sort((a, b) => b.packageCount - a.packageCount || a.name.localeCompare(b.name));
}

/**
 * Group packages by departure month
 * Returns array of MonthGroup objects sorted by date
 */
export function groupByMonth(packages: UmrohPackage[]): MonthGroup[] {
  const monthMap = new Map<string, {
    packages: UmrohPackage[];
    totalSeat: number;
    availableSeat: number;
  }>();

  packages.forEach(pkg => {
    const monthKey = getMonthKey(pkg.keberangkatan.tgl);
    const existing = monthMap.get(monthKey);

    if (existing) {
      existing.packages.push(pkg);
      existing.totalSeat += pkg.seatTotal;
      existing.availableSeat += pkg.seatSisa;
    } else {
      monthMap.set(monthKey, {
        packages: [pkg],
        totalSeat: pkg.seatTotal,
        availableSeat: pkg.seatSisa,
      });
    }
  });

  // Convert to array and sort by date
  return Array.from(monthMap.entries())
    .map(([monthKey, data]) => ({
      monthKey,
      monthName: formatMonthName(monthKey),
      monthNameHijri: approximateHijriMonth(data.packages[0].keberangkatan.tgl),
      totalSeat: data.totalSeat,
      availableSeat: data.availableSeat,
      packageCount: data.packages.length,
      packages: data.packages,
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

/**
 * Get display data for month grouping (for Data Per-Bulan dropdown)
 */
export function getMonthOptions(packages: UmrohPackage[]): Array<{
  value: string;
  label: string;
  sublabel: string;
  totalSeat: number;
  availableSeat: number;
}> {
  const groups = groupByMonth(packages);
  
  return groups.map(group => ({
    value: group.monthKey,
    label: group.monthName,
    sublabel: `${group.packageCount} paket • ${group.availableSeat}/${group.totalSeat} kursi`,
    totalSeat: group.totalSeat,
    availableSeat: group.availableSeat,
  }));
}

/**
 * Main filter function
 * Filters packages based on mode and optional secondary value
 */
export function filterPackages(
  data: UmrohPackage[],
  params: FilterParams
): UmrohPackage[] {
  const { mode, secondaryValue, today } = params;

  // "SEMUA DATA" is the only mode that may expose sold-out packages.
  // Every other schedule filter starts from packages that still have seats,
  // including modes whose secondary option has not been selected yet.
  if (mode === 'SEMUA DATA') {
    return data;
  }

  const availableData = data.filter(pkg => pkg.seatSisa > 0);

  switch (mode) {
    case 'AVAILABLE':
      return availableData;

    case 'LANDING DI':
      // Filter by landing city (airport code of the departure flight's final leg)
      if (!secondaryValue) {
        return availableData;
      }
      return availableData.filter(pkg => getLandingAirportCode(pkg) === secondaryValue);

    case 'LIBURAN_SEKOLAH':
      // Filter packages with departure in June or July 2026
      return availableData.filter(pkg => {
        const depDate = new Date(pkg.keberangkatan.tgl);
        const month = depDate.getMonth(); // 0-indexed: 5=June, 6=July
        const year = depDate.getFullYear();
        return year === 2026 && (month === 5 || month === 6);
      });

    case 'UMROH CUTI 5 HARI':
      return availableData.filter(matchesCuti5Hari);

    case 'TIPE PAKET': {
      // Tipe paket & keanggotaannya milik roster bersama (src/lib/packageType.js)
      // — halaman Brosur memakai daftar yang sama persis.
      if (!secondaryValue) {
        return availableData;
      }
      const musimDinginWindow = getMusimDinginWindow(today);
      return availableData.filter(pkg =>
        matchesPackageType(umrohTypeSubject(pkg), secondaryValue, musimDinginWindow)
      );
    }

    case 'DURASI PERJALANAN':
      // Filter by trip duration
      if (!secondaryValue) {
        return availableData;
      }
      return availableData.filter(pkg => {
        const days = calculateDuration(pkg);
        return days === parseInt(secondaryValue, 10);
      });

    case 'DATA PER-BULAN':
      // Filter by departure month
      if (!secondaryValue) {
        return availableData;
      }
      return availableData.filter(pkg => {
        const monthKey = getMonthKey(pkg.keberangkatan.tgl);
        return monthKey === secondaryValue;
      });

    default:
      return availableData;
  }
}

/**
 * Combined filter with multiple criteria
 * Useful when applying multiple filters at once
 */
export function filterPackagesAdvanced(
  data: UmrohPackage[],
  options: {
    mode?: FilterMode;
    secondaryValue?: string;
    searchQuery?: string;
    sortBy?: 'date_asc' | 'date_desc' | 'price_asc' | 'price_desc';
  }
): UmrohPackage[] {
  let result = [...data];
  const { mode, secondaryValue, searchQuery, sortBy } = options;

  // 1. Apply mode filter
  if (mode && mode !== 'SEMUA DATA') {
    result = filterPackages(result, { mode, secondaryValue });
  }

  // 2. Apply search query
  if (searchQuery?.trim()) {
    const query = searchQuery.toLowerCase().trim();
    result = result.filter(pkg => {
      const nameMatch = pkg.nama.toLowerCase().includes(query);
      const dateMatch = pkg.keberangkatan.tgl.includes(query) ||
                       pkg.kepulangan.tgl.includes(query);
      const airlineMatch = pkg.maskapai.toLowerCase().includes(query);
      return nameMatch || dateMatch || airlineMatch;
    });
  }

  // 3. Apply sorting
  if (sortBy) {
    switch (sortBy) {
      case 'date_asc':
        result.sort((a, b) => 
          new Date(a.keberangkatan.tgl).getTime() - new Date(b.keberangkatan.tgl).getTime()
        );
        break;
      case 'date_desc':
        result.sort((a, b) => 
          new Date(b.keberangkatan.tgl).getTime() - new Date(a.keberangkatan.tgl).getTime()
        );
        break;
      case 'price_asc':
        result.sort((a, b) => {
          const priceA = getMinPrice(a);
          const priceB = getMinPrice(b);
          return priceA - priceB;
        });
        break;
      case 'price_desc':
        result.sort((a, b) => {
          const priceA = getMinPrice(a);
          const priceB = getMinPrice(b);
          return priceB - priceA;
        });
        break;
    }
  }

  return result;
}

/**
 * Get minimum price from package for sorting
 */
export function getMinPrice(pkg: UmrohPackage): number {
  let minPrice = Infinity;
  
  for (const tierPricing of Object.values(pkg.harga)) {
    const prices = [
      tierPricing.Double,
      tierPricing.Triple,
      tierPricing.Quard,
    ].filter(Boolean);
    
    for (const price of prices) {
      const numPrice = parseInt(price!, 10);
      if (numPrice < minPrice) {
        minPrice = numPrice;
      }
    }
  }

  return minPrice === Infinity ? 0 : minPrice;
}

/**
 * Sort packages by the given sort order
 */
export function sortPackages(data: UmrohPackage[], order: SortOrder): UmrohPackage[] {
  const result = [...data];
  switch (order) {
    case 'TANGGAL_TERDEKAT':
      return result.sort((a, b) =>
        new Date(a.keberangkatan.tgl).getTime() - new Date(b.keberangkatan.tgl).getTime()
      );
    case 'TANGGAL_TERJAUH':
      return result.sort((a, b) =>
        new Date(b.keberangkatan.tgl).getTime() - new Date(a.keberangkatan.tgl).getTime()
      );
    case 'HARGA_TERMURAH':
      return result.sort((a, b) => getMinPrice(a) - getMinPrice(b));
    case 'HARGA_TERTINGGI':
      return result.sort((a, b) => getMinPrice(b) - getMinPrice(a));
    default:
      return result;
  }
}

/**
 * Get statistics for current filter result
 */
export function getFilterStats(packages: UmrohPackage[]): {
  total: number;
  available: number;
  soldOut: number;
  promo: number;
  totalSeats: number;
  availableSeats: number;
} {
  return {
    total: packages.length,
    available: packages.filter(p => p.seatSisa > 0).length,
    soldOut: packages.filter(p => p.seatSisa === 0).length,
    promo: packages.filter(p => p.isPromo).length,
    totalSeats: packages.reduce((sum, p) => sum + p.seatTotal, 0),
    availableSeats: packages.reduce((sum, p) => sum + p.seatSisa, 0),
  };
}
