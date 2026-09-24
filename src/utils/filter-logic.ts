/**
 * Filter Logic Utilities for Umroh Packages
 * Handles filtering, grouping, and data extraction
 */

import type { UmrohPackage } from '@/types';
import { calculateDuration } from '@/services/data-service';
import { getLandingAirportCode, getLandingCityName, getPackageJourneySteps } from './journey';
import { extraHotelsOf } from '@/lib/packageDetail';
// airportCityName, packageTypeSlug/FromSlug, dan konstanta PACKAGE_TYPE_* tidak
// lagi diimpor di sini: pemakainya ikut pindah ke lib/filter-slug.js.
import {
  getMusimDinginWindow,
  matchesPackageType,
  umrohTypeSubject,
} from '@/lib/packageType';
import {
  FILTER_MODE_LABELS as FILTER_MODE_LABELS_SHARED,
  FILTER_MODE_SLUGS as FILTER_MODE_SLUGS_SHARED,
  JOURNEY_START_FILTER_VALUES as JOURNEY_START_FILTER_VALUES_SHARED,
  LANDING_FILTER_CODES as LANDING_FILTER_CODES_SHARED,
  LEGACY_FILTER_SLUGS as LEGACY_FILTER_SLUGS_SHARED,
  MONTH_NAMES_ID as MONTH_NAMES_ID_SHARED,
  SLUG_TO_FILTER_MODE as SLUG_TO_FILTER_MODE_SHARED,
  buildFilterSlug as buildFilterSlugShared,
  filterModeLabel as filterModeLabelShared,
  getFilterSlug as getFilterSlugShared,
  journeyStartLabel as journeyStartLabelShared,
  resolveFilterSlug as resolveFilterSlugShared,
} from '../../lib/filter-slug.js';

// ============================================
// Kodek slug: re-export bertipe
// ============================================
//
// Kodeknya hidup di lib/filter-slug.js (JS murni) karena server.js memakainya
// untuk meta & kartu OG per filter — berkas ini TypeScript ber-alias '@' dan
// tidak bisa diimpor Node. Di sini ia dipakaikan kembali tipe FilterMode supaya
// 15 pemanggil resolveFilterSlug, barrel src/utils/index.ts, dan gerbang negatif
// di src/main.tsx tidak ada yang perlu berubah.
//
// JANGAN menyalin logikanya balik ke sini. Dua salinan berarti slug filter baru
// bisa hidup di halaman tapi kehilangan kartu OG-nya, tanpa satu tes pun merah.

export const FILTER_MODE_SLUGS = FILTER_MODE_SLUGS_SHARED as Record<FilterMode, string>;
export const FILTER_MODE_LABELS = FILTER_MODE_LABELS_SHARED as Record<FilterMode, string>;
export const SLUG_TO_FILTER_MODE = SLUG_TO_FILTER_MODE_SHARED as Record<string, FilterMode>;
export const LEGACY_FILTER_SLUGS = LEGACY_FILTER_SLUGS_SHARED as Record<string, { mode: FilterMode; secondaryValue?: string }>;

/** Sub-nilai "AWAL PERJALANAN" (UMROH, MADINAH, TOUR), urutan tampilnya. */
export const JOURNEY_START_FILTER_VALUES = JOURNEY_START_FILTER_VALUES_SHARED as readonly string[];

/** 'MADINAH' → 'Madinah' */
export function journeyStartLabel(value: string): string {
  return journeyStartLabelShared(value);
}

/** Label tampilan sebuah mode; mode tak dikenal jatuh ke teksnya sendiri. */
export function filterModeLabel(mode: FilterMode | string): string {
  return filterModeLabelShared(String(mode));
}

/** Get URL slug for a FilterMode */
export function getFilterSlug(mode: FilterMode): string {
  return getFilterSlugShared(mode);
}

/** Segmen filter untuk URL: mode + sub-nilai kalau ada. */
export function buildFilterSlug(mode: FilterMode, secondaryValue?: string): string {
  return buildFilterSlugShared(mode, secondaryValue);
}

/** Slug URL → mode + sub-nilainya (slug gabungan baru maupun slug lama). */
export function resolveFilterSlug(slug: string): { mode: FilterMode; secondaryValue?: string } | null {
  return resolveFilterSlugShared(slug) as { mode: FilterMode; secondaryValue?: string } | null;
}

/** Get FilterMode from a URL slug. Returns null if not a valid filter slug. */
export function getFilterModeFromSlug(slug: string): FilterMode | null {
  return resolveFilterSlug(slug)?.mode ?? null;
}

// ============================================
// Types
// ============================================

/**
 * Mode filter halaman jadwal publik.
 *
 * 'LIBURAN_SEKOLAH', 'UMROH CUTI 5 HARI', dan (sejak 2026-09-24) 'LANDING DI'
 * sengaja TIDAK ada di dropdown (FILTER_MODE_OPTIONS) tapi tetap hidup di sini: slug-nya sudah tersebar di
 * WhatsApp/iklan dan masih menyaring paket nyata. Menghapus slug-nya bukan cuma
 * menghilangkan filter — src/main.tsx memakai getFilterModeFromSlug sebagai
 * gerbang negatif, jadi URL yang tak dikenali dibaca sebagai ID paket dan
 * merender "Paket tidak ditemukan".
 */
export type FilterMode =
  | 'AVAILABLE'      // Filter paket dengan kursi tersedia
  | 'LANDING DI'     // Filter berdasarkan kota landing (Jeddah/Madinah/dll)
  | 'AWAL PERJALANAN' // Simpul pertama Urutan Perjalanan: Umroh Dulu / Madinah Dulu / Tur <destinasi>
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
  /**
   * Tombol mata di baris Cari: true = paket habis disembunyikan. Satu-satunya
   * gerbang kursi, di SEMUA mode. Bawaan halamannya AKTIF (state App); di sini
   * kosong = mati, supaya fungsi ini tetap murni.
   */
  availableOnly?: boolean;
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

/** Nama bulan Indonesia — dari kodek slug bersama (dipakai server.js juga). */
const MONTH_NAMES_ID = MONTH_NAMES_ID_SHARED;

/**
 * Singkatan 3 huruf untuk dropdown Bulan yang sempit. Ejaannya sama dengan
 * tanggal di kartu paket halaman ini (toLocaleDateString id-ID: Mei, Agu, Okt).
 */
const MONTH_NAMES_ID_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Hijri month names */
const HIJRI_MONTH_NAMES = [
  'Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir',
  'Jumadil Awal', 'Jumadil Akhir', 'Rajab', 'Syaban',
  'Ramadhan', 'Syawal', 'Dzulqaidah', 'Dzulhijjah'
];

// ============================================
// "Semua Jenis" sebagai opsi Jenis Paket
// ============================================
//
// Mode bawaan 'AVAILABLE' tidak punya tempat di dropdown utama; ia tampil
// sebagai opsi PERTAMA dropdown Jenis Paket, tepat di atas "Umroh Saja". Tetap
// mode 'AVAILABLE' di balik layar — itulah yang menjaga halaman bawaan di URL
// telanjang (/nikita), kartu OG & judul tab bawaan, dan telemetri mode yang
// sama. Terjemahannya hidup di empat fungsi di bawah supaya FilterHeader tidak
// merakitnya sendiri.
//
// Namanya "Seat Tersedia" sampai 2026-09-24. Sejak tombol mata ada di semua
// filter dan bawaannya aktif, kursi murni urusan tombol itu — dua kontrol untuk
// hal yang sama ditolak, jadi opsinya jadi "Semua Jenis" dan mode ini tidak
// lagi menyaring kursi sendiri.

/** Nilai opsi "Semua Jenis" di dropdown Jenis Paket. Bukan tipe paket di roster. */
export const SEMUA_JENIS_TYPE_VALUE = 'SEMUA JENIS';

/** Nilai yang ditampilkan dropdown utama untuk mode aktif. */
export function modeMenuValue(mode: FilterMode): FilterMode {
  return mode === 'AVAILABLE' ? 'TIPE PAKET' : mode;
}

/**
 * Pilihan di dropdown utama → mode sungguhan. JENIS PAKET mendarat di Semua
 * Jenis (sub-nilai bawaannya = halaman bawaan), bukan '- Pilih Jenis -'.
 */
export function resolveModeMenuChoice(choice: FilterMode): FilterMode {
  return choice === 'TIPE PAKET' ? 'AVAILABLE' : choice;
}

/** Nilai yang ditampilkan dropdown Jenis Paket. */
export function typeMenuValue(mode: FilterMode, secondaryValue: string): string {
  return mode === 'AVAILABLE' ? SEMUA_JENIS_TYPE_VALUE : secondaryValue;
}

/** Pilihan di dropdown Jenis Paket → mode + sub-nilai sungguhan. */
export function resolveTypeMenuChoice(choice: string): { mode: FilterMode; secondaryValue: string } {
  if (choice === SEMUA_JENIS_TYPE_VALUE) return { mode: 'AVAILABLE', secondaryValue: '' };
  return { mode: 'TIPE PAKET', secondaryValue: choice };
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
 * Label opsi dropdown "DATA PER-BULAN": "Jun 2026 (350/400)" = sisa seat /
 * total seat seluruh paket di bulan itu. Nama bulan disingkat supaya angka
 * kursinya muat di trigger selebar setengah baris di HP.
 *
 * Seat dari data-service lewat parseInt, jadi upstream yang kosong jadi NaN —
 * lebih baik nama bulan saja daripada "(NaN/400)".
 */
export function monthOptionLabel(group: Pick<MonthGroup, 'monthKey' | 'availableSeat' | 'totalSeat'>): string {
  const [year, month] = group.monthKey.split('-');
  const name = `${MONTH_NAMES_ID_SHORT[parseInt(month, 10) - 1] ?? month} ${year}`;
  if (!Number.isFinite(group.availableSeat) || !Number.isFinite(group.totalSeat)) return name;
  return `${name} (${group.availableSeat}/${group.totalSeat})`;
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

/** Kota landing yang boleh jadi pilihan filter (dua pintu masuk Saudi). */
export const LANDING_FILTER_CODES: readonly string[] = LANDING_FILTER_CODES_SHARED;

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
    if (!LANDING_FILTER_CODES.includes(code)) return;
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
 * Awal perjalanan paket sebagai nilai filter "AWAL PERJALANAN", dari simpul
 * PERTAMA rantai Urutan Perjalanan (getPackageJourneySteps): 'UMROH',
 * 'MADINAH', atau label turnya ('TUR DUBAI'). null kalau urutannya tak bisa
 * dipastikan (mis. pp Jeddah tanpa itinerary) atau simpulnya di luar roster —
 * fail-closed, tidak dipaksa masuk opsi lain. Keanggotaannya jadi identik
 * dengan rantai yang tampil di kartu.
 *
 * Kota hotel tambahan diambil dengan extraHotelsOf seperti PackageCard. Kartu
 * mengoper blok tier AKTIF, di sini tier pertama yang ada — hasilnya sama,
 * karena extraHotelsOf jatuh ke tier lain untuk kota yang kosong di tier itu,
 * dan rantai hanya memakai NAMA kotanya.
 *
 * Sengaja di sini, bukan di journey.ts: berkas itu bebas impor non-tipe dan
 * diuji dengan esbuild transform tanpa bundling (tests/package-journey.test.js).
 */
export function getPackageJourneyStart(pkg: UmrohPackage): string | null {
  const firstTier = Object.values(pkg.hotel || {}).find(Boolean);
  const extraCities = extraHotelsOf(firstTier, pkg.hotel as Record<string, unknown>).map(hotel => hotel.city);
  const first = getPackageJourneySteps(pkg, extraCities)[0];
  if (!first) return null;
  const value = (first.tone === 'tour' ? first.label : first.tone).toUpperCase();
  return JOURNEY_START_FILTER_VALUES.includes(value) ? value : null;
}

/**
 * Opsi sub-filter "AWAL PERJALANAN" dalam urutan roster (Umroh Dulu, Madinah
 * Dulu, lalu tur per destinasi), hanya yang punya paket. Tanpa jumlah paket —
 * permintaan user. Paket yang urutannya tak bisa dipastikan tidak masuk opsi
 * mana pun: lebih jujur daripada dipaksa ke salah satunya.
 */
export function extractJourneyStarts(packages: UmrohPackage[]): Array<{ value: string; label: string }> {
  const present = new Set<string>();
  packages.forEach(pkg => {
    const value = getPackageJourneyStart(pkg);
    if (value) present.add(value);
  });
  return JOURNEY_START_FILTER_VALUES
    .filter(value => present.has(value))
    .map(value => ({ value, label: journeyStartLabel(value) }));
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
  const { mode, secondaryValue, today, availableOnly } = params;

  // Gerbang kursi = tombol mata, di SEMUA mode, tanpa pengecualian. Tidak ada
  // mode yang menyaring kursi sendiri lagi (AVAILABLE dulu "Seat Tersedia");
  // dua kontrol untuk hal yang sama bisa saling bertentangan. Dimatikan,
  // paket habis tetap jawaban yang sah — kartunya dicoret merah.
  const base = availableOnly ? data.filter(pkg => pkg.seatSisa > 0) : data;

  switch (mode) {
    case 'AVAILABLE':
    case 'SEMUA DATA':
      return base;

    case 'LANDING DI':
      // Filter by landing city (airport code of the departure flight's final leg)
      if (!secondaryValue) {
        return base;
      }
      return base.filter(pkg => getLandingAirportCode(pkg) === secondaryValue);

    case 'AWAL PERJALANAN': {
      // Simpul pertama rantai Urutan Perjalanan di kartu — BUKAN kota landing:
      // banyak paket mendarat di Jeddah lalu ke Madinah dulu.
      if (!secondaryValue) {
        return base;
      }
      const wanted = secondaryValue.toUpperCase();
      return base.filter(pkg => getPackageJourneyStart(pkg) === wanted);
    }

    case 'LIBURAN_SEKOLAH':
      // Filter packages with departure in June or July 2026
      return base.filter(pkg => {
        const depDate = new Date(pkg.keberangkatan.tgl);
        const month = depDate.getMonth(); // 0-indexed: 5=June, 6=July
        const year = depDate.getFullYear();
        return year === 2026 && (month === 5 || month === 6);
      });

    case 'UMROH CUTI 5 HARI':
      return base.filter(matchesCuti5Hari);

    case 'TIPE PAKET': {
      // Tipe paket & keanggotaannya milik roster bersama (src/lib/packageType.js)
      // — halaman Brosur memakai daftar yang sama persis.
      if (!secondaryValue) {
        return base;
      }
      const musimDinginWindow = getMusimDinginWindow(today);
      return base.filter(pkg =>
        matchesPackageType(umrohTypeSubject(pkg), secondaryValue, musimDinginWindow)
      );
    }

    case 'DURASI PERJALANAN':
      // Filter by trip duration
      if (!secondaryValue) {
        return base;
      }
      return base.filter(pkg => {
        const days = calculateDuration(pkg);
        return days === parseInt(secondaryValue, 10);
      });

    case 'DATA PER-BULAN':
      // Filter by departure month
      if (!secondaryValue) {
        return base;
      }
      return base.filter(pkg => {
        const monthKey = getMonthKey(pkg.keberangkatan.tgl);
        return monthKey === secondaryValue;
      });

    default:
      return base;
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
