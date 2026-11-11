// Kelengkapan dokumen & perlengkapan jamaah umroh — pure, no I/O.
//
// Bentuk data AIW berubah diam-diam (ketahuan 11 Nov 2026 lewat pengingat paspor
// Telegram yang menandai SEMUA jamaah "belum kumpul paspor"):
//   - `paspor_nomor` tidak dikirim lagi → kolom no_paspor selalu kosong.
//   - `dokumen` kini teks daftar yang SUDAH diterima kantor, mis.
//     "fc paspor, fc buku vaksin, fc ktp" — bukan objek centang seperti laporan
//     web lama ({ paspor: true, ... }).
//   - `perlengkapan` bernilai angka 1/0, bukan true/false, dan memuat item
//     milik gender lain (mukena/kerudung untuk pria, ikhram untuk wanita) = 0.
// Semua aturan pembacaannya dikumpulkan di sini supaya sync, notifikasi, dan
// dashboard memakai tafsir yang sama.

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

// Kunci yang SELALU diisi (true/false) saat AIW mengirim teks dokumen: kelimanya
// terbukti ada di kosakata AIW, jadi "tidak disebut" berarti belum diterima.
const DOKUMEN_KUNCI_TETAP = ['paspor', 'vaksin', 'ktp', 'kk', 'foto'];

function dokumenTokenKey(token) {
  const t = String(token || '')
    .toLowerCase()
    .replace(/^(fc|fotokopi|fotocopy|foto\s*copy|copy)\s+/, '')
    .trim();
  if (!t) return null;
  if (t.includes('paspor') || t.includes('passport')) return 'paspor';
  if (t.includes('mening') || t.includes('mining')) return 'meningitis';
  if (t.includes('vaksin')) return 'vaksin';
  if (t.includes('ktp')) return 'ktp';
  if (t.includes('kartu keluarga') || t === 'kk') return 'kk';
  if (t.includes('nikah')) return 'buku_nikah';
  if (t.includes('akta')) return 'akta_lahir';
  if (t.includes('pernyataan')) return 'pernyataan';
  if (t.startsWith('foto')) return 'foto';
  return t.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || null;
}

/**
 * Teks dokumen AIW → objek centang. Mengembalikan null bila `text` bukan teks
 * (null/objek) — pemanggil memakai jalur lama. Teks kosong = belum ada dokumen
 * satu pun, jadi semua kunci tetap bernilai false.
 */
export function parseDokumenText(text) {
  if (typeof text !== 'string') return null;
  const dokumen = {};
  for (const key of DOKUMEN_KUNCI_TETAP) dokumen[key] = false;
  for (const token of text.split(/[,;\n]+/)) {
    const key = dokumenTokenKey(token);
    if (key) dokumen[key] = true;
  }
  return dokumen;
}

/** Paspor sudah diterima kantor: centang dokumen ATAU nomor paspor terisi. */
export function isPasporCollected(row) {
  const dokumen = plainObject(row?.dokumen) || {};
  if (dokumen.paspor === true || dokumen.passport === true) return true;
  return String(row?.no_paspor || '').trim() !== '';
}

function perlengkapanKey(key) {
  return String(key || '').toLowerCase().replace(/[\s_]+/g, '_');
}

function genderOf(jk) {
  const t = String(jk || '').trim().toLowerCase();
  if (t === 'l' || t.startsWith('laki') || t === 'pria') return 'L';
  if (t === 'p' || t.startsWith('perempuan') || t === 'wanita') return 'P';
  return null;
}

// Tidak dihitung "kurang":
//   - syal/bergo/sabuk: mengikuti tampilan dashboard (JamaahPage) yang juga
//     menyembunyikannya.
//   - tasbih: 294 dari 335 jamaah yang berangkat ≤30 hari bernilai 0 (cek 11 Nov
//     2026) — tidak dicatat serah-terimanya, jadi bukan sinyal "belum diambil".
const PERLENGKAPAN_DIABAIKAN = new Set(['syal', 'bergo', 'sabuk', 'tasbih']);

/**
 * Daftar perlengkapan yang belum diambil jamaah ini (nama item apa adanya).
 * Item gender lain tidak dihitung; bila gender tak dikenal, item bergender
 * dilewati supaya tidak menuduh. Mengembalikan null bila data perlengkapan
 * kosong (API/laporan belum punya catatan sama sekali).
 */
export function missingPerlengkapan(row) {
  const perlengkapan = plainObject(row?.perlengkapan);
  if (!perlengkapan || Object.keys(perlengkapan).length === 0) return null;
  const gender = genderOf(row?.jk);
  const missing = [];
  for (const [key, value] of Object.entries(perlengkapan)) {
    const nk = perlengkapanKey(key);
    if (PERLENGKAPAN_DIABAIKAN.has(nk)) continue;
    if (nk === 'ikhram' && gender !== 'L') continue;
    if ((nk === 'mukena' || nk === 'kerudung') && gender !== 'P') continue;
    if (!value) missing.push(key.replace(/_/g, ' '));
  }
  return missing;
}

/** Perlengkapan belum lengkap: tanpa catatan sama sekali, atau ada yang kurang. */
export function isPerlengkapanIncomplete(row) {
  const missing = missingPerlengkapan(row);
  return missing === null || missing.length > 0;
}
