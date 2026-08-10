// Pencarian jamaah (Umroh + Haji) — logika pencocokan dipisah dari server.js
// supaya bisa diuji langsung; server.js tak bisa di-import di tes.
//
// Latar: `jamaah.wa` dan `jamaah_haji.telp` menyimpan digit murni tanpa
// pemisah, tapi awalannya campur — mayoritas `62…`, sisanya `0…`. Mencocokkan
// input mentah dengan ilike membuat agent yang mengetik `0812…` hanya
// menjangkau ~4% baris. Lihat docs/superpowers/specs/2026-08-10-pencarian-jamaah-multi-field-design.md

// Di bawah ini input dianggap "nomor" — sisanya diperlakukan sebagai teks.
const PHONE_INPUT_RE = /^[\d+\s().-]+$/;

// Ambang inti nomor. Tanpa ini, mengetik "8" mencocokkan hampir semua baris
// dan mengubur hasil pencarian nama.
const MIN_PHONE_CORE_DIGITS = 4;

const MAX_NEEDLE_LENGTH = 100;

/**
 * Buang awalan negara/nol agar `0812…` dan `62812…` bertemu di bentuk yang
 * sama. Satu bentuk ini cocok dua arah karena keduanya memuatnya sebagai
 * substring.
 */
function phoneCore(digits) {
  if (digits.startsWith('62')) return digits.slice(2);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/**
 * @param {string|null|undefined} input
 * @returns {{ text: string, phone: string|null }|null} null bila tak ada
 *   pencarian aktif (kosong atau hanya spasi).
 */
export function buildJamaahSearchNeedle(input) {
  const raw = String(input ?? '').trim().slice(0, MAX_NEEDLE_LENGTH);
  if (!raw) return null;

  let phone = null;
  if (PHONE_INPUT_RE.test(raw)) {
    const core = phoneCore(raw.replace(/\D/g, ''));
    if (core.length >= MIN_PHONE_CORE_DIGITS) phone = core;
  }

  return { text: raw.toLowerCase(), phone };
}

function textHit(value, needleText) {
  return String(value ?? '').toLowerCase().includes(needleText);
}

function phoneHit(value, needlePhone) {
  if (!needlePhone) return false;
  return String(value ?? '').replace(/\D/g, '').includes(needlePhone);
}

/**
 * Pencocokan satu baris jamaah umroh. Nama jadwal sengaja diambil dari
 * scheduleMap — itu hasil enrich, bukan kolom baris, dan justru itulah yang
 * tampil di kartu jamaah.
 */
export function matchesUmrohJamaahSearch(row, needle, scheduleMap = new Map()) {
  if (!needle) return true;
  if (!row) return false;

  if (phoneHit(row.wa, needle.phone)) return true;

  const jadwalNama = scheduleMap.get(row.raw_data?.id_jadwal) || '';
  return [row.nama, row.id_umroh, row.jm_id, row.no_paspor, row.paket, jadwalNama]
    .some(value => textHit(value, needle.text));
}

// PostgREST memperlakukan karakter ini sebagai metakarakter di dalam .or() —
// tanpa escaping, input agent bisa menyusup ke ekspresi filter.
function escapePostgrestFilterValue(value) {
  return String(value ?? '').replace(/[,()*%]/g, (c) => '\\' + c);
}

/**
 * Susun ekspresi `.or()` PostgREST. Dipakai endpoint Haji, yang dipaginasi di
 * DB sehingga pencocokannya harus tetap terjadi di sana.
 *
 * Kolom nomor hanya menerima term nomor: mencocokkan term teks ke situ akan
 * mengembalikan derau pendek yang justru dicegah MIN_PHONE_CORE_DIGITS.
 *
 * @returns {string|null} null bila tak ada pencarian aktif.
 */
export function buildJamaahSearchOrFilter(input, { textColumns = [], phoneColumns = [] } = {}) {
  const needle = buildJamaahSearchNeedle(input);
  if (!needle) return null;

  const safeText = escapePostgrestFilterValue(needle.text);
  const terms = textColumns.map(col => `${col}.ilike.%${safeText}%`);

  if (needle.phone) {
    const safePhone = escapePostgrestFilterValue(needle.phone);
    terms.push(...phoneColumns.map(col => `${col}.ilike.%${safePhone}%`));
  }

  return terms.length ? terms.join(',') : null;
}
