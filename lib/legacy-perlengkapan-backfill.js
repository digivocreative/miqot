// Backfill kolom `jamaah.perlengkapan` dari laporan web legacy Alhijaz — pure, no I/O.
//
// Sejak ~akhir Sep 2026 AWAPI mengirim `perlengkapan: null` untuk serah-terima yang
// sudah dicentang di web Alhijaz. Dicek 22 Okt 2026 (agent nikita, 13 minggu
// pendaftaran): kalau API punya objek perlengkapan isinya SELALU sama dengan web,
// tapi 63 jamaah dicentang di web sementara API null. Laporan web
// (_claporanm.php — difilter per TANGGAL DAFTAR, bukan tanggal berangkat) masih
// memuat kolom perlengkapan, jadi job harian di server.js menambal HANYA kolom
// perlengkapan untuk:
//   - jamaah yang belum berangkat dan perlengkapannya kosong di snapshot API
//     (raw_data.perlengkapan), atau
//   - SEMUA jamaah yang belum berangkat bila sync API agent itu macet (mis. AWAPI
//     403 "Invalid or inactive User" sejak 1 Okt 2026) — API tak akan menimpanya.
// Baris yang punya data API dibiarkan: API benar di sana, dan menimpanya dengan
// format legacy akan bolak-balik tiap siklus sync API (churn Disk-IO).
// AWAPI null tidak lagi menimpa hasil backfill: preserveLegacyUmrohRawData
// (awapi-client.js) mempertahankan perlengkapan yang sudah ada.

import { stableStringify } from './jamaah-upsert.js';

export const LEGACY_PERLENGKAPAN_BACKFILL_TIMES_WIB = Object.freeze(['06:00']);

// Boot setelah deploy menjalankan backfill hanya bila run terakhir lebih tua dari
// ini — restart berulang dalam sehari tidak memicu login legacy berulang.
export const LEGACY_PERLENGKAPAN_BACKFILL_MAX_AGE_MS = 20 * 60 * 60 * 1000;

export const LEGACY_PERLENGKAPAN_WINDOW_DAYS = 7;

// Kolom laporan web (snake_case, boolean) → kunci AWAPI (spasi, 0/1), hanya item
// yang ada di KEDUA sistem. bergo & syal tidak ada di AWAPI dan disembunyikan UI;
// madu/sajadah/tasbih/kerudung tidak ada di web sehingga tidak diketahui.
export const LEGACY_TO_AWAPI_PERLENGKAPAN_KEYS = Object.freeze({
  batik: 'batik',
  buku_doa: 'buku doa',
  ikhram: 'ikhram',
  koper: 'koper',
  mukena: 'mukena',
  sabuk: 'sabuk',
  tas_paspor: 'tas paspor',
});

const LEGACY_ONLY_KEYS = new Set(['bergo', 'syal']);

// parseLaporanHtml mengisi false untuk sel yang tidak ada; baris yang terpotong
// sebelum kolom TAS PASPOR (indeks 15) jangan sampai menghapus centang yang benar.
const MIN_LAPORAN_COLUMNS = 16;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeItemKey(key) {
  return String(key).toLowerCase().replace(/[\s_]+/g, '_');
}

function normalizeNama(nama) {
  return String(nama || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function hasPerlengkapanEntries(value) {
  return Object.keys(plainObject(value)).length > 0;
}

/**
 * Apakah baris jamaah perlu ditambal dari laporan web?
 * `row.api_perlengkapan` = raw_data->perlengkapan (snapshot terakhir dari API).
 * `today` = tanggal WIB 'YYYY-MM-DD'. `apiStale` = sync API agent macet.
 */
export function needsLegacyPerlengkapanBackfill(row, { today, apiStale = false } = {}) {
  if (!row?.tgl_daftar || !row?.tgl_berangkat) return false;
  if (String(row.tgl_berangkat).slice(0, 10) < today) return false;
  return apiStale || !hasPerlengkapanEntries(row.api_perlengkapan);
}

/**
 * Jendela tanggal daftar minimum (masing-masing `spanDays` hari, sama dengan
 * chunk laporan yang dipakai sync) yang menutup semua tanggal di `dates`.
 * `tglAkhir` EKSKLUSIF: laporan membandingkan tgl_daftar (datetime) dengan
 * tglAkhir 00:00 — dicek 22 Okt 2026, 5 Okt..5 Okt = 0 baris, 5 Okt..6 Okt = 5.
 */
export function buildTglDaftarWindows(dates, spanDays = LEGACY_PERLENGKAPAN_WINDOW_DAYS) {
  const sorted = [...new Set(
    (dates || [])
      .map(d => String(d || '').slice(0, 10))
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
  )].sort();
  const windows = [];
  for (const date of sorted) {
    const last = windows[windows.length - 1];
    if (last && date < last.tglAkhir) continue;
    windows.push({ tglAwal: date, tglAkhir: addDays(date, spanDays) });
  }
  return windows;
}

/** Perlengkapan laporan web → bentuk AWAPI ({ 'buku doa': 1, ... }), atau null. */
export function mapLegacyPerlengkapan(legacyPerlengkapan) {
  const legacy = plainObject(legacyPerlengkapan);
  const mapped = {};
  for (const [legacyKey, awapiKey] of Object.entries(LEGACY_TO_AWAPI_PERLENGKAPAN_KEYS)) {
    if (Object.hasOwn(legacy, legacyKey)) mapped[awapiKey] = legacy[legacyKey] ? 1 : 0;
  }
  return Object.keys(mapped).length > 0 ? mapped : null;
}

/**
 * Gabungkan perlengkapan yang ada dengan hasil laporan web. Item yang ada di web
 * menang (web = sumber hidup saat API null); item yang hanya ada di API lama
 * (madu, sajadah, …) dipertahankan; kunci format legacy lama (buku_doa, bergo,
 * syal) dibuang supaya hasilnya satu format. Null bila web tidak memberi apa-apa.
 */
export function mergeLegacyPerlengkapan(existing, legacyPerlengkapan) {
  const mapped = mapLegacyPerlengkapan(legacyPerlengkapan);
  if (!mapped) return null;
  const replaced = new Set(Object.keys(mapped).map(normalizeItemKey));
  const kept = {};
  for (const [key, value] of Object.entries(plainObject(existing))) {
    const normalized = normalizeItemKey(key);
    if (replaced.has(normalized) || LEGACY_ONLY_KEYS.has(normalized)) continue;
    kept[key] = value;
  }
  return { ...kept, ...mapped };
}

/**
 * Cocokkan item laporan ke baris DB dalam booking yang sama: jm_id utuh bila ada;
 * selain itu akhiran jm_id yang terpotong CSS ("JM...84559") bila unik — tahan
 * nama yang diedit di web (DB "DITA" vs web "DITTA"); terakhir nama (spasi
 * dirapikan). Null bila tidak ada / ambigu.
 */
export function matchLaporanItemToRow(item, rowsByBooking) {
  const candidates = rowsByBooking.get(String(item?.id_umroh || '')) || [];
  if (candidates.length === 0) return null;
  const jmId = String(item.jm_id || '').trim().toUpperCase();
  if (jmId) return candidates.find(r => String(r.jm_id || '').toUpperCase() === jmId) || null;
  if (item.jm_id_hint) {
    const hinted = candidates.filter(r => String(r.jm_id || '').endsWith(item.jm_id_hint));
    if (hinted.length === 1) return hinted[0];
  }
  const nama = normalizeNama(item.nama);
  let named = candidates.filter(r => normalizeNama(r.nama) === nama);
  if (named.length > 1 && item.jm_id_hint) {
    named = named.filter(r => String(r.jm_id || '').endsWith(item.jm_id_hint));
  }
  return named.length === 1 ? named[0] : null;
}

/**
 * Rencana patch: hanya baris target (`rows`) yang perlengkapannya benar-benar
 * berubah. Returns { patches: [{ id, perlengkapan }], matched, unmatched, unchanged, skipped }.
 */
export function planLegacyPerlengkapanPatches(rows, items) {
  const rowsByBooking = new Map();
  for (const row of rows || []) {
    const key = String(row.id_umroh || '');
    if (!rowsByBooking.has(key)) rowsByBooking.set(key, []);
    rowsByBooking.get(key).push(row);
  }

  const patchById = new Map();
  let matched = 0, unmatched = 0, unchanged = 0, skipped = 0;
  for (const item of items || []) {
    if (!(Number(item?.raw_data?.cols_count) >= MIN_LAPORAN_COLUMNS)) { skipped++; continue; }
    const row = matchLaporanItemToRow(item, rowsByBooking);
    if (!row) { unmatched++; continue; }
    matched++;
    const merged = mergeLegacyPerlengkapan(row.perlengkapan, item.perlengkapan);
    // Web tanpa centang + DB masih kosong = sama-sama "belum diambil"; tidak ditulis.
    const nothingNew = !hasPerlengkapanEntries(row.perlengkapan)
      && !Object.values(merged || {}).some(Boolean);
    if (!merged || nothingNew || stableStringify(merged) === stableStringify(row.perlengkapan ?? null)) {
      unchanged++;
      continue;
    }
    patchById.set(row.id, { id: row.id, perlengkapan: merged });
  }
  return { patches: [...patchById.values()], matched, unmatched, unchanged, skipped };
}

export function isLegacyPerlengkapanBackfillDue(lastRunMs, nowMs = Date.now(), maxAgeMs = LEGACY_PERLENGKAPAN_BACKFILL_MAX_AGE_MS) {
  return !Number.isFinite(lastRunMs) || nowMs - lastRunMs > maxAgeMs;
}
