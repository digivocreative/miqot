/**
 * Teks meta & kartu share untuk URL filter halaman Jadwal publik.
 *
 * SATU sumber untuk dua pemakai: server.js (suntikan SSR + rute /og/filter) dan
 * src/App.tsx (judul tab saat pindah filter tanpa reload). Kalau dipisah, judul
 * tab dan kartu WhatsApp bisa menyebut filter yang sama dengan dua nama berbeda.
 *
 * Kartunya TIDAK memuat data paket (jumlah/harga/tanggal) — itu keputusan
 * produk, dan konsekuensinya modul ini tidak butuh satu baris pun data jadwal.
 * Semua yang dibutuhkan terbaca dari slug URL saja, jadi tidak ada kemungkinan
 * kartu mengaku "4 paket" di atas halaman yang menampilkan 5.
 */

import { MONTH_NAMES_ID, journeyStartLabel, landingCityName, resolveFilterSlug } from './filter-slug.js';
import { packageTypeLabel } from '../src/lib/packageType.js';

const COMPANY = 'Alhijaz Indowisata';

/**
 * Label dimensi SENGAJA tidak diambil dari FILTER_MODE_LABELS: label itu milik
 * dropdown — HURUF BESAR semua, dan sebagiannya jargon internal. "DATA
 * PER-BULAN" tidak pantas tayang di kartu yang dikirim agent ke jamaah.
 *
 * Mode yang TIDAK ada di sini sengaja tidak dapat kartu sendiri: AVAILABLE,
 * SEMUA DATA, LIBURAN_SEKOLAH, dan UMROH CUTI 5 HARI itu keadaan halaman, bukan
 * filter berdimensi yang layak punya kartu.
 */
const DIMENSION = {
  'TIPE PAKET':        { eyebrow: 'JENIS PAKET',       bare: 'Jenis Paket' },
  'LANDING DI':        { eyebrow: 'KOTA LANDING',      bare: 'Kota Landing' },
  'AWAL PERJALANAN':   { eyebrow: 'AWAL PERJALANAN',   bare: 'Awal Perjalanan' },
  'DURASI PERJALANAN': { eyebrow: 'DURASI PERJALANAN', bare: 'Durasi Perjalanan' },
  'DATA PER-BULAN':    { eyebrow: 'KEBERANGKATAN',     bare: 'Keberangkatan' },
};

/** '2026-11' → 'November 2026' */
function monthHeadline(value) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!m) return '';
  const name = MONTH_NAMES_ID[parseInt(m[2], 10) - 1];
  return name ? `${name} ${m[1]}` : '';
}

/** Teks besar di kartu. */
function headlineFor(mode, value) {
  if (!value) return DIMENSION[mode].bare;
  switch (mode) {
    // 'UMROH RAMADHAN' → 'Umroh Ramadhan'; 'PLUS AL ULA' → 'Plus AL ULA'.
    case 'TIPE PAKET': return packageTypeLabel(value);
    case 'LANDING DI': return landingCityName(value);
    case 'AWAL PERJALANAN': return journeyStartLabel(value);
    case 'DURASI PERJALANAN': return `${value} Hari`;
    case 'DATA PER-BULAN': return monthHeadline(value);
    default: return DIMENSION[mode].bare;
  }
}

/**
 * Bentuk untuk <title> — sengaja beda dari headline kartu. Kartu punya eyebrow
 * yang sudah menyebut dimensinya; judul tab tidak, jadi kata penjelasnya ikut
 * masuk ("Madinah" sendirian tidak berarti apa-apa di daftar tab browser).
 */
function titleHeadFor(mode, value, headline) {
  if (!value) return DIMENSION[mode].bare;
  switch (mode) {
    case 'LANDING DI': return `Landing ${headline}`;
    // 'Madinah Dulu' sudah kalimat utuh; tur butuh kata kerjanya.
    case 'AWAL PERJALANAN': return value.startsWith('TUR ') ? `Mulai dari ${headline}` : headline;
    case 'DURASI PERJALANAN': return `Umroh ${headline}`;
    case 'DATA PER-BULAN': return `Keberangkatan ${headline}`;
    default: return headline;
  }
}

/**
 * Frasa objek untuk deskripsi. Sengaja per dimensi, bukan `titleHead` yang
 * di-lowercase: "paket umroh ramadhan" mematikan huruf besar nama bulan/paket,
 * dan "paket keberangkatan november 2026" sama sekali bukan bahasa Indonesia
 * yang wajar. Teks ini yang dibaca jamaah di preview WhatsApp.
 */
function subjectFor(mode, value, headline) {
  if (!value) {
    switch (mode) {
      case 'TIPE PAKET': return 'paket umroh dari semua jenis';
      case 'LANDING DI': return 'paket umroh menurut kota landing';
      case 'AWAL PERJALANAN': return 'paket umroh menurut awal perjalanan';
      case 'DURASI PERJALANAN': return 'paket umroh menurut durasi perjalanan';
      case 'DATA PER-BULAN': return 'paket umroh menurut bulan keberangkatan';
      default: return 'paket umroh';
    }
  }
  switch (mode) {
    case 'TIPE PAKET': return `paket ${headline}`;
    case 'LANDING DI': return `paket umroh yang mendarat di ${headline}`;
    // "dimulai dari Umroh" janggal — umroh itu ibadah, bukan tempat.
    case 'AWAL PERJALANAN':
      if (value === 'UMROH') return 'paket umroh yang dimulai dengan ibadah umroh';
      if (value === 'MADINAH') return 'paket umroh yang dimulai dari Madinah';
      return `paket umroh yang dimulai dengan ${headline}`;
    case 'DURASI PERJALANAN': return `paket umroh ${headline.toLowerCase()}`;
    case 'DATA PER-BULAN': return `paket umroh keberangkatan ${headline}`;
    default: return 'paket umroh';
  }
}

export function buildFilterShareMeta({ filterSlug, agentName, agentSlug } = {}) {
  const resolved = resolveFilterSlug(filterSlug);
  if (!resolved) return null;

  const dimension = DIMENSION[resolved.mode];
  if (!dimension) return null;

  const value = resolved.secondaryValue || '';
  const headline = headlineFor(resolved.mode, value);
  if (!headline) return null;

  const titleHead = titleHeadFor(resolved.mode, value, headline);
  const name = String(agentName || '').trim();
  const slug = String(agentSlug || '').trim();

  const title = name
    ? `${titleHead} — Jadwal Umroh Alhijaz | ${name}`
    : `${titleHead} — Jadwal Umroh ${COMPANY}`;

  const subject = subjectFor(resolved.mode, value, headline);
  const description = name
    ? `Jadwal dan harga ${subject} dari ${COMPANY} bersama ${name}. Klik untuk lihat pilihan paket dan konsultasi via WhatsApp.`
    : `Jadwal dan harga ${subject} dari ${COMPANY}. Klik untuk lihat pilihan paket dan konsultasi via WhatsApp.`;

  // Slug sudah lolos resolveFilterSlug, jadi bentuknya dijamin aman untuk path.
  const safeSlug = String(filterSlug).toLowerCase();
  const ogImagePath = slug
    ? `/og/filter/${slug}/${safeSlug}.png`
    : `/og/filter/${safeSlug}.png`;

  return {
    mode: resolved.mode,
    eyebrow: dimension.eyebrow,
    headline,
    title,
    description,
    ogImagePath,
  };
}
