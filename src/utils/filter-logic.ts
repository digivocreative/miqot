/**
 * Filter Logic Utilities for Umroh Packages
 * Handles filtering, grouping, and data extraction
 */

import type { UmrohPackage } from '@/types';
import { calculateDuration } from '@/services/data-service';
import { airportCityName, getLandingAirportCode, getLandingCityName } from './journey';
import {
  getMusimDinginWindow,
  matchesPackageType,
  packageTypeFromSlug,
  packageTypeSlug,
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
  /**
   * Tombol "hanya seat tersedia" di baris Cari. MENYEMPITKAN, bukan
   * melebarkan: bawaannya mati (mode berdimensi memuat paket habis), dan nyala
   * berarti yang habis disembunyikan.
   *
   * Hanya berlaku untuk MODES_WITH_AVAILABILITY_TOGGLE. Di luar itu tombolnya
   * tidak dirender, jadi flag yang nyasar dari URL diabaikan — kalau tidak,
   * daftar menyusut karena saringan yang tombolnya tak terlihat.
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

/**
 * Label yang DILIHAT pengunjung untuk tiap mode.
 *
 * Sengaja dipisah dari nilai FilterMode: nilainya sudah terikat ke slug URL
 * (/tipe-paket), ke LEGACY_FILTER_SLUGS, dan ke logika filterPackages — jadi
 * "TIPE PAKET" tetap nilai internal walau di layar tertulis "JENIS PAKET".
 * Dipakai dropdown utama (FilterHeader) DAN pesan kosong di App, supaya kedua
 * teks tidak pernah menyebut mode yang sama dengan dua nama berbeda.
 */
export const FILTER_MODE_LABELS: Record<FilterMode, string> = {
  'AVAILABLE': 'SEAT TERSEDIA',
  'TIPE PAKET': 'JENIS PAKET',
  'LANDING DI': 'LANDING DI',
  'LIBURAN_SEKOLAH': 'LIBURAN SEKOLAH',
  'UMROH CUTI 5 HARI': 'UMROH CUTI 5 HARI',
  'DURASI PERJALANAN': 'DURASI PERJALANAN',
  'DATA PER-BULAN': 'DATA PER-BULAN',
  'SEMUA DATA': 'SEMUA DATA',
};

/** Label tampilan sebuah mode; mode tak dikenal jatuh ke teksnya sendiri. */
export function filterModeLabel(mode: FilterMode | string): string {
  return FILTER_MODE_LABELS[mode as FilterMode] ?? String(mode).replace(/_/g, ' ');
}

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

/**
 * Mode yang memunculkan tombol "hanya seat tersedia".
 *
 * Sengaja TANPA 'AVAILABLE' dan 'SEMUA DATA': keduanya sudah menyatakan
 * gerbang kursinya lewat namanya sendiri, jadi tombol di sana cuma bikin dua
 * kontrol yang bisa saling bertentangan. Satu daftar untuk App (gerbang state
 * + reset), FilterHeader (render tombol), dan filterPackages (fail-closed).
 */
export const MODES_WITH_AVAILABILITY_TOGGLE: readonly FilterMode[] = [
  'LANDING DI',
  'LIBURAN_SEKOLAH',
  'UMROH CUTI 5 HARI',
  'TIPE PAKET',
  'DURASI PERJALANAN',
  'DATA PER-BULAN',
];

/** Get URL slug for a FilterMode */
export function getFilterSlug(mode: FilterMode): string {
  return FILTER_MODE_SLUGS[mode] || '';
}

// ============================================
// Slug gabungan: mode + sub-nilai jadi SATU segmen
// ============================================
//
// `/nikita/landing-madinah`, bukan `/nikita/landing-di?landing=med`. Bentuk ini
// dipilih karena link jadwal hidupnya di WhatsApp: agent menyalin dan sering
// membacakannya, jadi satu segmen yang bisa dibaca manusia lebih berguna
// daripada pasangan param yang mengulang nama modenya.
//
// Slug lama TETAP dikenali (SLUG_TO_FILTER_MODE + LEGACY_FILTER_SLUGS + alias
// query di src/utils/filter-url.ts) — tidak ada link tersebar yang mati.
//
// HATI-HATI: src/main.tsx memakai getFilterModeFromSlug sebagai gerbang NEGATIF
// (slug tak dikenal = ID paket). Setiap pola di bawah karena itu wajib sempit
// dan tertutup; pola yang terlalu longgar akan menelan `/nikita/JBU1574` dan
// mengubah halaman detail paket jadi daftar jadwal.

const LANDING_SLUG_PREFIX = 'landing-';
const DURATION_SLUG_SUFFIX = '-hari';

function slugifyCity(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 'MED' → 'landing-madinah' (nama kota, bukan kode — kode tak terbaca jamaah). */
function landingSlug(code: string): string | null {
  const key = String(code || '').trim().toUpperCase();
  if (!LANDING_FILTER_CODES.includes(key)) return null;
  const city = slugifyCity(airportCityName(key));
  return city ? `${LANDING_SLUG_PREFIX}${city}` : null;
}

function landingFromSlug(slug: string): string | null {
  if (!slug.startsWith(LANDING_SLUG_PREFIX)) return null;
  const city = slug.slice(LANDING_SLUG_PREFIX.length);
  if (!city) return null;
  return LANDING_FILTER_CODES.find(code => slugifyCity(airportCityName(code)) === city) ?? null;
}

/** '2026-11' → 'november-2026' */
function monthSlug(monthKey: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!match) return null;
  const name = MONTH_NAMES_ID[parseInt(match[2], 10) - 1];
  return name ? `${name.toLowerCase()}-${match[1]}` : null;
}

function monthFromSlug(slug: string): string | null {
  const match = /^([a-z]+)-(\d{4})$/.exec(slug);
  if (!match) return null;
  const index = MONTH_NAMES_ID.findIndex(name => name.toLowerCase() === match[1]);
  if (index < 0) return null;
  return `${match[2]}-${String(index + 1).padStart(2, '0')}`;
}

/** '9' → '9-hari' */
function durationSlug(days: string): string | null {
  return /^\d{1,2}$/.test(String(days || '').trim()) ? `${parseInt(days, 10)}${DURATION_SLUG_SUFFIX}` : null;
}

function durationFromSlug(slug: string): string | null {
  const match = new RegExp(`^(\\d{1,2})${DURATION_SLUG_SUFFIX}$`).exec(slug);
  return match ? String(parseInt(match[1], 10)) : null;
}

/**
 * Segmen filter untuk URL: mode + sub-nilai kalau ada, kalau tidak slug mode.
 * Mengembalikan '' untuk mode bawaan (AVAILABLE) — pemanggil menyusun path-nya.
 */
export function buildFilterSlug(mode: FilterMode, secondaryValue?: string): string {
  const base = getFilterSlug(mode);
  const value = String(secondaryValue || '').trim();
  if (!value) return base;

  switch (mode) {
    case 'LANDING DI':
      return landingSlug(value) || base;
    case 'DATA PER-BULAN':
      return monthSlug(value) || base;
    case 'DURASI PERJALANAN':
      return durationSlug(value) || base;
    case 'TIPE PAKET':
      return packageTypeSlug(value) || base;
    default:
      return base;
  }
}

/** Slug URL → mode + sub-nilainya (slug gabungan baru maupun slug lama). */
export function resolveFilterSlug(slug: string): { mode: FilterMode; secondaryValue?: string } | null {
  const key = String(slug || '').toLowerCase();
  if (!key) return null;

  const mode = SLUG_TO_FILTER_MODE[key];
  if (mode) return { mode };

  const legacy = LEGACY_FILTER_SLUGS[key];
  if (legacy) return legacy;

  const landing = landingFromSlug(key);
  if (landing) return { mode: 'LANDING DI', secondaryValue: landing };

  const month = monthFromSlug(key);
  if (month) return { mode: 'DATA PER-BULAN', secondaryValue: month };

  const days = durationFromSlug(key);
  if (days) return { mode: 'DURASI PERJALANAN', secondaryValue: days };

  // Roster tipe paket itu tertutup (PACKAGE_TYPE_ORDER), jadi aman sebagai
  // penutup: slug asing tetap jatuh ke null → dibaca sebagai ID paket.
  const type = packageTypeFromSlug(key);
  if (type) return { mode: 'TIPE PAKET', secondaryValue: type };

  return null;
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
 * Kota landing yang boleh jadi pilihan filter "LANDING DI" — hanya dua pintu
 * masuk Saudi.
 *
 * getLandingAirportCode punya fallback ke kedatangan TERAKHIR rute berangkat
 * saat rantainya tidak pernah menyentuh Saudi (salah entri, atau paket yang
 * rutenya berhenti di kota tur seperti DXB/IST/CAI). Kode itu bukan kota
 * landing, dan dulu ikut muncul sebagai opsi — pilihan yang tak berarti buat
 * jamaah. Di sini ia disaring keluar; paketnya tetap tampil di mode lain.
 */
export const LANDING_FILTER_CODES: readonly string[] = ['JED', 'MED'];

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

  // Gerbang kursi tidak lagi otomatis. Mode 'AVAILABLE' memang berarti "seat
  // tersedia"; mode lain menjawab pertanyaan berbeda ("bulan Oktober ada apa?",
  // "yang landing Madinah mana?") dan paket habis tetap jawaban yang sah —
  // kartunya dicoret merah, jadi pengunjung tahu itu sudah penuh. Dulu SEMUA
  // mode menyaring kursi, dan akibatnya bulan/landing yang habis total tidak
  // pernah bisa ditampilkan sama sekali.
  //
  // `availableOnly` (tombol di baris Cari) memasang kembali gerbang itu atas
  // permintaan user — hanya di mode yang benar-benar merender tombolnya.
  const seatGated =
    mode === 'AVAILABLE' ||
    (!!availableOnly && MODES_WITH_AVAILABILITY_TOGGLE.includes(mode));
  const base = seatGated ? data.filter(pkg => pkg.seatSisa > 0) : data;

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
