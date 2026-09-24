/**
 * Kodek slug filter halaman Jadwal publik — SATU sumber untuk tiga pemakai:
 *   1. Klien   → src/utils/filter-logic.ts (re-export bertipe; pemanggil tak berubah)
 *   2. Router  → src/main.tsx lewat getFilterModeFromSlug (GERBANG NEGATIF)
 *   3. Server  → server.js, untuk meta & kartu OG per filter
 *
 * Diangkat ke sini karena filter-logic.ts itu TypeScript ber-alias '@' dan
 * mengimpor data-service — Node tidak bisa mengimpornya. Menyalin kodeknya ke
 * server bukan pilihan: slug filter bertambah dari waktu ke waktu
 * ('umroh-ramadhan' lahir 2026-09-20), dan salinan yang tertinggal membuat slug
 * baru kehilangan kartu OG-nya tanpa satu tes pun gagal.
 *
 * JEBAKAN: setiap pola di sini WAJIB sempit dan tertutup. main.tsx membaca
 * "slug tak dikenal" sebagai ID paket; pola yang melonggar akan menelan
 * /nikita/JBU1574 dan mengubah halaman detail paket jadi daftar jadwal.
 * Dijaga tests/filter-slug.test.js (langsung) dan tests/jadwal-filter-url.test.js
 * (dari sisi pemanggil TypeScript).
 */

import { packageTypeFromSlug, packageTypeSlug } from '../src/lib/packageType.js';

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Kota landing yang boleh jadi pilihan filter "LANDING DI" — hanya dua pintu
 * masuk Saudi. getLandingAirportCode punya fallback ke kedatangan TERAKHIR rute
 * berangkat saat rantainya tak pernah menyentuh Saudi (paket yang berhenti di
 * kota tur seperti DXB/IST/CAI); kode itu bukan kota landing dan disaring keluar.
 */
export const LANDING_FILTER_CODES = ['JED', 'MED'];

/**
 * Nama kota untuk DUA kode landing saja. Sengaja bukan seluruh
 * LANDING_AIRPORT_MAP milik journey.ts — modul ini tidak boleh menyeret
 * dependensi TypeScript. Paritasnya dikunci tests/filter-slug.test.js, yang
 * membandingkan dengan journey.ts ASLI (dibundel esbuild), bukan salinan.
 */
const LANDING_CITY_NAME = { JED: 'Jeddah', MED: 'Madinah' };

export function landingCityName(code) {
  const key = String(code || '').trim().toUpperCase();
  return LANDING_CITY_NAME[key] || key;
}

/**
 * Sub-nilai filter "AWAL PERJALANAN" → labelnya, dalam urutan tampil. Nilainya
 * diturunkan dari simpul PERTAMA rantai Urutan Perjalanan di kartu
 * (src/utils/journey.ts): 'UMROH'/'MADINAH' dari tone-nya, tur dari label
 * simpulnya ('Tur Dubai' → 'TUR DUBAI') — jadi tur terpecah per destinasi.
 *
 * Roster TERTUTUP — ia juga menutup pola slug `awal-*`. Baris tur WAJIB sama
 * dengan tur internasional di journey.ts (INTERNATIONAL_TOUR_LABELS); modul ini
 * tidak boleh mengimpor TypeScript, jadi paritasnya dikunci
 * tests/jadwal-filter-awal-perjalanan.test.js. Tur dalam Saudi (Taif, Badar,
 * Red Sea) sengaja absen: ia tak pernah membuka rantai.
 */
const JOURNEY_START_LABEL = {
  UMROH: 'Umroh Dulu',
  MADINAH: 'Madinah Dulu',
  'TUR DUBAI': 'Tur Dubai',
  'TUR TURKI': 'Tur Turki',
  'TUR MESIR': 'Tur Mesir',
  'TUR CHINA': 'Tur China',
  'TUR AQSHA': 'Tur Aqsha',
};

export const JOURNEY_START_FILTER_VALUES = Object.keys(JOURNEY_START_LABEL);

export function journeyStartLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return JOURNEY_START_LABEL[key] || key;
}

/** Map FilterMode ke slug URL. AVAILABLE (bawaan) tidak punya slug. */
export const FILTER_MODE_SLUGS = {
  'AVAILABLE': '',
  'LANDING DI': 'landing-di',
  'AWAL PERJALANAN': 'awal-perjalanan',
  'LIBURAN_SEKOLAH': 'liburan-sekolah',
  'UMROH CUTI 5 HARI': 'cuti-5-hari',
  'TIPE PAKET': 'tipe-paket',
  'DURASI PERJALANAN': 'durasi-perjalanan',
  'DATA PER-BULAN': 'data-per-bulan',
  'SEMUA DATA': 'semua-data',
};

/**
 * Label yang DILIHAT pengunjung untuk tiap mode. Sengaja dipisah dari nilai
 * FilterMode: nilainya sudah terikat ke slug URL (/tipe-paket), ke
 * LEGACY_FILTER_SLUGS, dan ke logika filterPackages — jadi "TIPE PAKET" tetap
 * nilai internal walau di layar tertulis "JENIS PAKET".
 */
export const FILTER_MODE_LABELS = {
  // Dulu 'SEAT TERSEDIA'. Sejak 2026-09-24 kursi murni urusan tombol mata, dan
  // mode bawaan ini tampil sebagai JENIS PAKET → SEMUA JENIS.
  'AVAILABLE': 'SEMUA JENIS',
  'TIPE PAKET': 'JENIS PAKET',
  'LANDING DI': 'LANDING DI',
  'AWAL PERJALANAN': 'AWAL PERJALANAN',
  'LIBURAN_SEKOLAH': 'LIBURAN SEKOLAH',
  'UMROH CUTI 5 HARI': 'UMROH CUTI 5 HARI',
  'DURASI PERJALANAN': 'DURASI PERJALANAN',
  'DATA PER-BULAN': 'DATA PER-BULAN',
  'SEMUA DATA': 'SEMUA DATA',
};

/** Label tampilan sebuah mode; mode tak dikenal jatuh ke teksnya sendiri. */
export function filterModeLabel(mode) {
  return FILTER_MODE_LABELS[mode] ?? String(mode).replace(/_/g, ' ');
}

/** Reverse map: slug → FilterMode */
export const SLUG_TO_FILTER_MODE = Object.fromEntries(
  Object.entries(FILTER_MODE_SLUGS)
    .filter(([, slug]) => slug !== '')
    .map(([mode, slug]) => [slug, mode])
);

/**
 * Slug mode yang sudah dihapus → tipe paket terdekat di roster baru.
 *
 * JANGAN dihapus. Tautan `/umroh-promo`, `/{agent}/bintang-5`, dst. sudah
 * tersebar, dan src/main.tsx memakai getFilterModeFromSlug sebagai gerbang
 * negatif: slug yang tak dikenal jatuh ke cabang detail paket dan merender
 * "Paket tidak ditemukan" dengan HTTP 200 — bukan 404, bukan redirect.
 *
 * 'bintang-5' → Umroh Rahmah karena RAHMAH itulah tier hotel bintang 5 di
 * kosakata Alhijaz. Nilainya ditulis literal (bukan konstanta PACKAGE_TYPE_*)
 * supaya modul ini tidak mengimpor konstanta yang cuma dipakai di sini;
 * tes bolak-balik yang menguncinya tetap sama.
 */
export const LEGACY_FILTER_SLUGS = {
  'umroh-promo': { mode: 'TIPE PAKET', secondaryValue: 'UMROH PROMO' },
  'umroh-musim-dingin': { mode: 'TIPE PAKET', secondaryValue: 'UMROH MUSIM DINGIN' },
  'umroh-reguler': { mode: 'TIPE PAKET', secondaryValue: 'UMROH SAJA' },
  'bintang-5': { mode: 'TIPE PAKET', secondaryValue: 'UMROH RAHMAH' },
};

/** Get URL slug for a FilterMode */
export function getFilterSlug(mode) {
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

const LANDING_SLUG_PREFIX = 'landing-';
const JOURNEY_START_SLUG_PREFIX = 'awal-';
const DURATION_SLUG_SUFFIX = '-hari';

function slugifyCity(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 'MED' → 'landing-madinah' (nama kota, bukan kode — kode tak terbaca jamaah). */
function landingSlug(code) {
  const key = String(code || '').trim().toUpperCase();
  if (!LANDING_FILTER_CODES.includes(key)) return null;
  const city = slugifyCity(landingCityName(key));
  return city ? `${LANDING_SLUG_PREFIX}${city}` : null;
}

function landingFromSlug(slug) {
  if (!slug.startsWith(LANDING_SLUG_PREFIX)) return null;
  const city = slug.slice(LANDING_SLUG_PREFIX.length);
  if (!city) return null;
  return LANDING_FILTER_CODES.find(code => slugifyCity(landingCityName(code)) === city) ?? null;
}

/** 'MADINAH' → 'awal-madinah', 'TUR DUBAI' → 'awal-tur-dubai' */
function journeyStartSlug(value) {
  const key = String(value || '').trim().toUpperCase();
  return JOURNEY_START_FILTER_VALUES.includes(key)
    ? `${JOURNEY_START_SLUG_PREFIX}${key.toLowerCase().replace(/\s+/g, '-')}`
    : null;
}

function journeyStartFromSlug(slug) {
  if (!slug.startsWith(JOURNEY_START_SLUG_PREFIX)) return null;
  return JOURNEY_START_FILTER_VALUES.find(value => journeyStartSlug(value) === slug) ?? null;
}

/** '2026-11' → 'november-2026' */
function monthSlug(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!match) return null;
  const name = MONTH_NAMES_ID[parseInt(match[2], 10) - 1];
  return name ? `${name.toLowerCase()}-${match[1]}` : null;
}

function monthFromSlug(slug) {
  const match = /^([a-z]+)-(\d{4})$/.exec(slug);
  if (!match) return null;
  const index = MONTH_NAMES_ID.findIndex(name => name.toLowerCase() === match[1]);
  if (index < 0) return null;
  return `${match[2]}-${String(index + 1).padStart(2, '0')}`;
}

/** '9' → '9-hari' */
function durationSlug(days) {
  return /^\d{1,2}$/.test(String(days || '').trim())
    ? `${parseInt(days, 10)}${DURATION_SLUG_SUFFIX}`
    : null;
}

function durationFromSlug(slug) {
  const match = new RegExp(`^(\\d{1,2})${DURATION_SLUG_SUFFIX}$`).exec(slug);
  return match ? String(parseInt(match[1], 10)) : null;
}

/**
 * Segmen filter untuk URL: mode + sub-nilai kalau ada, kalau tidak slug mode.
 * Mengembalikan '' untuk mode bawaan (AVAILABLE) — pemanggil menyusun path-nya.
 */
export function buildFilterSlug(mode, secondaryValue) {
  const base = getFilterSlug(mode);
  const value = String(secondaryValue || '').trim();
  if (!value) return base;

  switch (mode) {
    case 'LANDING DI':
      return landingSlug(value) || base;
    case 'AWAL PERJALANAN':
      return journeyStartSlug(value) || base;
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
export function resolveFilterSlug(slug) {
  const key = String(slug || '').toLowerCase();
  if (!key) return null;

  const mode = SLUG_TO_FILTER_MODE[key];
  if (mode) return { mode };

  const legacy = LEGACY_FILTER_SLUGS[key];
  if (legacy) return legacy;

  const landing = landingFromSlug(key);
  if (landing) return { mode: 'LANDING DI', secondaryValue: landing };

  const journeyStart = journeyStartFromSlug(key);
  if (journeyStart) return { mode: 'AWAL PERJALANAN', secondaryValue: journeyStart };

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
export function getFilterModeFromSlug(slug) {
  return resolveFilterSlug(slug)?.mode ?? null;
}
