/**
 * Filter aktif ⇄ URL halaman jadwal publik.
 *
 * KENAPA ADA: agent bekerja dengan cara MENYALIN link. Sebelum ini hanya mode
 * (segmen path) dan `?tipe=` yang ikut; "LANDING DI → Madinah",
 * "DATA PER-BULAN → November", filter cepat, dan rentang jam hilang begitu link
 * dibuka orang lain — penerima melihat seluruh katalog, bukan hasil saringan
 * yang dijanjikan.
 *
 * PEMBAGIAN TUGAS:
 * - Mode + sub-nilainya → SATU segmen path yang bisa dibaca manusia
 *   (`/nikita/landing-madinah`). Encoder/decoder-nya `buildFilterSlug` &
 *   `resolveFilterSlug` di filter-logic.ts, karena src/main.tsx memakai
 *   resolusi slug yang sama sebagai gerbang rute.
 * - Filter di bottom sheet + urutan → query pendek di file ini
 *   (`?promo&urut=termurah`).
 *
 * BENTUK QUERY-NYA SENGAJA PER-DIMENSI, bukan satu param "secondary" yang
 * artinya berubah ikut mode. Halaman ini masih memakai satu mode eksklusif,
 * tapi rencananya bergerak ke facet yang bisa ditumpuk (bulan + jenis
 * sekaligus); dengan skema ini URL lama tetap sah dan `parseFilterSearch`
 * tinggal dipakai apa adanya.
 *
 * Semua parse-nya fail-closed: nilai yang tidak dikenali diabaikan, bukan
 * diteruskan ke filter. Link yang dipotong WhatsApp atau diketik ulang
 * pengunjung tidak boleh menghasilkan daftar kosong yang membingungkan.
 */

import { packageTypeFromSlug } from '@/lib/packageType';
import type { FilterMode, SortOrder } from './filter-logic';

/** Rentang jam (berangkat/pulang) di sheet "Filter Cepat". */
export type TimeRange = '00-06' | '06-12' | '12-18' | '18-24';

export const TIME_RANGE_VALUES: readonly TimeRange[] = ['00-06', '06-12', '12-18', '18-24'];

/** Nama rentang jam di URL — '00-06' tak terbaca, 'dini-hari' terbaca. */
const TIME_RANGE_SLUGS: Record<TimeRange, string> = {
  '00-06': 'dini-hari',
  '06-12': 'pagi',
  '12-18': 'siang',
  '18-24': 'malam',
};

const SLUG_TO_TIME_RANGE: Record<string, TimeRange> = Object.fromEntries(
  Object.entries(TIME_RANGE_SLUGS).map(([range, slug]) => [slug, range as TimeRange]),
) as Record<string, TimeRange>;

/**
 * Filter cepat di bottom sheet.
 *
 * Dulu ada empat ('promo' | 'urgent' | 'termurah' | 'rahmah') tapi tidak pernah
 * dirender sama sekali. 'termurah' duplikat dropdown Urutkan dan 'rahmah'
 * duplikat Jenis Paket, jadi yang dihidupkan hanya dua yang tidak punya jalan
 * lain: status promo (flag dari upstream, bukan dari nama paket) dan sisa kursi.
 */
export type QuickFilterType = 'promo' | 'urgent';

export const QUICK_FILTER_VALUES: readonly QuickFilterType[] = ['promo', 'urgent'];

/** Ambang "seat menipis" untuk filter cepat `urgent`. */
export const URGENT_SEAT_THRESHOLD = 5;

export const DEPARTURE_RANGE_PARAM = 'berangkat';
export const RETURN_RANGE_PARAM = 'pulang';
export const SORT_PARAM = 'urut';

const SORT_SLUGS: Record<SortOrder, string> = {
  'TANGGAL_TERDEKAT': 'terdekat',
  'TANGGAL_TERJAUH': 'terjauh',
  'HARGA_TERMURAH': 'termurah',
  'HARGA_TERTINGGI': 'termahal',
};

const SLUG_TO_SORT: Record<string, SortOrder> = {
  ...Object.fromEntries(Object.entries(SORT_SLUGS).map(([order, slug]) => [slug, order as SortOrder])),
  // Alias bentuk lama supaya link yang sempat dibagikan tidak kehilangan urutan.
  'tanggal-terdekat': 'TANGGAL_TERDEKAT',
  'tanggal-terjauh': 'TANGGAL_TERJAUH',
  'harga-termurah': 'HARGA_TERMURAH',
  'harga-tertinggi': 'HARGA_TERTINGGI',
};

/** Urutan bawaan mode ber-sort; tidak ditulis ke URL supaya link tetap pendek. */
const DEFAULT_SORT: SortOrder = 'TANGGAL_TERDEKAT';

/**
 * Param sub-nilai LAMA. Tidak pernah ditulis lagi (sub-nilai sekarang menyatu
 * di segmen path), hanya DIBACA supaya `/nikita/tipe-paket?tipe=umroh-promo`
 * dan kerabatnya tetap membuka filter yang benar.
 */
const LEGACY_SECONDARY_PARAM: Partial<Record<FilterMode, string>> = {
  'TIPE PAKET': 'tipe',
  'LANDING DI': 'landing',
  'DATA PER-BULAN': 'bulan',
  'DURASI PERJALANAN': 'durasi',
};

const LEGACY_QUICK_FILTER_PARAM = 'cepat';

export interface FilterUrlState {
  quickFilter?: QuickFilterType | null;
  departureRanges?: readonly TimeRange[];
  returnRanges?: readonly TimeRange[];
  sortOrder?: SortOrder | null;
}

export interface ParsedFilterUrl {
  /**
   * Sub-nilai dari param LAMA, per mode — ambil yang cocok dengan mode aktif.
   * Sengaja tidak diciutkan jadi satu nilai: begitu facet bisa ditumpuk,
   * semuanya terpakai bersamaan tanpa mengubah bentuk data ini.
   */
  secondary: Partial<Record<FilterMode, string>>;
  quickFilter: QuickFilterType | null;
  departureRanges: TimeRange[];
  returnRanges: TimeRange[];
  sortOrder: SortOrder | null;
}

function decodeLegacySecondary(mode: FilterMode, raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  switch (mode) {
    case 'TIPE PAKET':
      return packageTypeFromSlug(value) || null;
    case 'LANDING DI':
      return /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null;
    case 'DATA PER-BULAN':
      return /^\d{4}-\d{2}$/.test(value) ? value : null;
    case 'DURASI PERJALANAN':
      // "09" dan "9" adalah durasi yang sama; sub-nilai di aplikasi tanpa nol depan.
      return /^\d{1,2}$/.test(value) ? String(parseInt(value, 10)) : null;
    default:
      return null;
  }
}

function encodeRanges(ranges: readonly TimeRange[] | undefined): string | null {
  if (!ranges?.length) return null;
  // Urutan tetap (bukan urutan klik) supaya link yang sama tidak berubah bentuk.
  const slugs = TIME_RANGE_VALUES.filter(r => ranges.includes(r)).map(r => TIME_RANGE_SLUGS[r]);
  return slugs.length ? slugs.join(',') : null;
}

function decodeRanges(raw: string | null): TimeRange[] {
  if (!raw) return [];
  const wanted = new Set(
    raw.split(',').map(part => part.trim().toLowerCase()),
  );
  return TIME_RANGE_VALUES.filter(range => wanted.has(TIME_RANGE_SLUGS[range]) || wanted.has(range));
}

/**
 * Query string (termasuk '?') untuk filter sheet + urutan, atau '' bila
 * semuanya di nilai bawaan.
 *
 * Dirakit manual, BUKAN lewat URLSearchParams.toString(): toString() menulis
 * koma sebagai %2C ("berangkat=00-06%2C12-18") — persis keluhan "berantakan"
 * yang membuat skema ini ditulis ulang. Koma legal di query string.
 */
export function buildFilterSearch(state: FilterUrlState): string {
  const parts: string[] = [];

  if (state.quickFilter && QUICK_FILTER_VALUES.includes(state.quickFilter)) {
    // Flag tanpa nilai: modenya sudah jelas dari namanya sendiri.
    parts.push(state.quickFilter);
  }

  const berangkat = encodeRanges(state.departureRanges);
  if (berangkat) parts.push(`${DEPARTURE_RANGE_PARAM}=${berangkat}`);

  const pulang = encodeRanges(state.returnRanges);
  if (pulang) parts.push(`${RETURN_RANGE_PARAM}=${pulang}`);

  if (state.sortOrder && state.sortOrder !== DEFAULT_SORT && SORT_SLUGS[state.sortOrder]) {
    parts.push(`${SORT_PARAM}=${SORT_SLUGS[state.sortOrder]}`);
  }

  return parts.length ? `?${parts.join('&')}` : '';
}

/** Kebalikan buildFilterSearch. Menerima 'a=b', '?a=b', atau URLSearchParams. */
export function parseFilterSearch(search: string | URLSearchParams): ParsedFilterUrl {
  const params = typeof search === 'string' ? new URLSearchParams(search.replace(/^\?/, '')) : search;

  const secondary: Partial<Record<FilterMode, string>> = {};
  for (const [mode, param] of Object.entries(LEGACY_SECONDARY_PARAM) as [FilterMode, string][]) {
    const decoded = decodeLegacySecondary(mode, params.get(param) || '');
    if (decoded) secondary[mode] = decoded;
  }

  const legacyQuick = (params.get(LEGACY_QUICK_FILTER_PARAM) || '').trim().toLowerCase();
  const quickFilter =
    QUICK_FILTER_VALUES.find(value => params.has(value)) ??
    (QUICK_FILTER_VALUES.includes(legacyQuick as QuickFilterType) ? (legacyQuick as QuickFilterType) : null);

  const sortRaw = (params.get(SORT_PARAM) || '').trim().toLowerCase();

  return {
    secondary,
    quickFilter,
    departureRanges: decodeRanges(params.get(DEPARTURE_RANGE_PARAM)),
    returnRanges: decodeRanges(params.get(RETURN_RANGE_PARAM)),
    sortOrder: SLUG_TO_SORT[sortRaw] ?? null,
  };
}

/** Dimensi filter untuk telemetri. */
export function filterDimension(mode: FilterMode): string {
  return LEGACY_SECONDARY_PARAM[mode] || 'mode';
}
