/**
 * Tipe paket umroh — SATU sumber aturan untuk dua tempat yang menampilkan
 * filter "Tipe Paket":
 *   1. Brosur jadwal   → src/components/BrochureSchedulePage.tsx (dimensi 'tipe')
 *   2. Jadwal publik   → src/components/FilterHeader.tsx + src/utils/filter-logic.ts
 *
 * Roster, urutan, label, DAN predikat keanggotaannya hidup di sini supaya dua
 * halaman tidak bisa menyimpang diam-diam: kalau daftar opsi dan isi filter
 * memakai aturan berbeda, lahir opsi yang menghasilkan nol paket (dead end).
 *
 * Modul ini tidak tahu bentuk data halaman mana pun. Ia bekerja atas shape
 * minimal `PackageTypeSubject`; tiap halaman menyediakan adapternya sendiri
 * (brochureTypeSubject / umrohTypeSubject di bawah).
 *
 * JEBAKAN yang sudah menggigit sebelumnya, jangan diulang:
 * - Nama paket yang masuk ke sini BERBEDA bentuk antar halaman. Brosur mengirim
 *   nama hasil cleanBrochurePackageName (server.js — frasa "MIX PAKET RAHMAH &
 *   UHUD" dan "12HR" dibuang, lalu di-UPPERCASE), Jadwal mengirim `jadwal_nama`
 *   MENTAH. Semua pola di sini karena itu case-insensitive dan ber-`\b`, dan
 *   keanggotaan tier TIDAK BOLEH ditentukan dari nama (lihat TIER_FOR_PACKAGE_TYPE).
 * - Kalau aturan pembersih nama di server berubah (mis. ikut membuang "PROMO"),
 *   kedua halaman bisa mulai berselisih tanpa satu tes pun gagal. Uji paritasnya
 *   di tests/package-type.test.js.
 */

export const PACKAGE_TYPE_UMROH_SAJA = 'UMROH SAJA';
export const PACKAGE_TYPE_UMROH_RAHMAH = 'UMROH RAHMAH';
export const PACKAGE_TYPE_UMROH_PROMO = 'UMROH PROMO';
export const PACKAGE_TYPE_UMROH_MUSIM_DINGIN = 'UMROH MUSIM DINGIN';
export const PACKAGE_TYPE_UMROH_RAMADHAN = 'UMROH RAMADHAN';
export const PACKAGE_TYPE_KERETA_CEPAT = 'KERETA CEPAT';

// Order matters: the first matching pattern wins. Foreign extensions are
// listed before in-KSA local extensions (Taif, Badar, Al Ula) so a
// "PLUS DUBAI + TAIF" package categorises as Dubai, not Taif.
//
// HAIKOU sengaja `HAIKOU?`: AWAPI menulis "PLUS HAIKO" (tanpa U) sehingga pola
// lama `\bHAIKOU\b` tidak pernah cocok dan paketnya jatuh ke UMROH SAJA. AL ULA
// juga tidak punya pola sama sekali. Keduanya membuat paket ber-"PLUS" muncul di
// bawah opsi "Umroh Saja" — di halaman publik itu terbaca salah.
export const PACKAGE_TYPES = [
  { value: 'PLUS TURKI',  pattern: /\b(TURK[IY]|TURKEY)\b/i },
  { value: 'PLUS DUBAI',  pattern: /\bDUBAI\b/i },
  { value: 'PLUS MESIR',  pattern: /\b(MESIR|CAIRO|ALEXANDRIA|EGYPT)\b/i },
  { value: 'PLUS HAIKOU', pattern: /\bHAIKOU?\b/i },
  { value: 'PLUS REDSEA', pattern: /\bREDSEA\b/i },
  { value: 'PLUS TAIF',   pattern: /\bTAIF\b/i },
  { value: 'PLUS BADAR',  pattern: /\bBADAR\b/i },
  { value: 'PLUS AL ULA', pattern: /\bAL\s*ULA\b/i },
];

/**
 * Nama destinasi di luar roster tetap jatuh ke UMROH SAJA (fail-open) — bukan
 * hilang dari semua opsi. Paket yang terlihat salah kategori masih bisa diklik;
 * paket yang tidak masuk opsi mana pun tidak bisa ditemukan sama sekali.
 */
export function derivePackageType(rawName) {
  const s = String(rawName || '');
  for (const t of PACKAGE_TYPES) {
    if (t.pattern.test(s)) return t.value;
  }
  return PACKAGE_TYPE_UMROH_SAJA;
}

// Satu-satunya pola "Kereta Cepat" di aplikasi: dipakai pill di brosur DAN
// filter Tipe Paket di kedua halaman. Kalau dipisah, sebuah paket bisa lolos
// filter tanpa memakai pill-nya — atau sebaliknya.
export const KERETA_CEPAT_PATTERN = /\bKERETA\s+CEPAT\b/i;

export function hasKeretaCepat(rawName) {
  return KERETA_CEPAT_PATTERN.test(String(rawName || ''));
}

/**
 * Pilih musim dingin TERDEKAT relatif "today" (dihitung UTC):
 *   - Today di bulan Des  → window = Des(year)   + Jan(year+1)
 *   - Today di bulan Jan  → window = Des(year-1) + Jan(year)   (musim yang sedang jalan)
 *   - Today Feb–Nov       → window = Des(year)   + Jan(year+1) (musim berikutnya)
 * Tanpa penjendelaan ini, "Desember atau Januari tahun apa pun" mencampur dua
 * musim dingin berbeda begitu data memuat lebih dari satu tahun.
 */
export function getMusimDinginWindow(today) {
  const d = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
  const month = d.getUTCMonth(); // 0=Jan, 11=Des
  const year = d.getUTCFullYear();
  if (month === 11) return { yearOfDec: year };
  if (month === 0) return { yearOfDec: year - 1 };
  return { yearOfDec: year };
}

/**
 * 'YYYY-MM-DD' → Date UTC, atau null kalau bentuknya salah ATAU tanggalnya
 * meluap ('2026-11-31' di-parse JS jadi 1 Des). Round-trip check-nya wajib:
 * tanpa itu paket bertanggal rusak diam-diam pindah bulan dan bisa lolos
 * jendela yang bukan miliknya. Pola yang sama dipakai formatTglID di
 * BrochureScheduleTemplate. Dipakai bersama oleh dua jendela tanggal di bawah.
 */
function parseIsoDateUtc(iso) {
  const s = String(iso || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const dt = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return null;
  const [, mm, dd] = s.split('-').map(Number);
  if (dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd) return null;
  return dt;
}

/** Tanggal berangkat (YYYY-MM-DD) jatuh di jendela musim dingin itu. */
export function isMusimDinginDeparture(iso, musimDinginWindow) {
  const dt = parseIsoDateUtc(iso);
  if (!dt) return false;
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const yearOfDec = musimDinginWindow?.yearOfDec;
  if (!Number.isFinite(yearOfDec)) return false;
  return (y === yearOfDec && m === 11) || (y === yearOfDec + 1 && m === 0);
}

// ============================================
// Umroh Ramadhan
// ============================================
//
// Keanggotaannya ditentukan TANGGAL BERANGKAT, bukan nama paket — persis seperti
// Umroh Musim Dingin. Alasannya terbaca di data 1448: "UMRAH HEMAT SYABAN 9HR"
// tidak menyebut Ramadhan sama sekali tapi berangkat 3 Feb dan pulang 11 Feb,
// jadi separuh perjalanannya di dalam Ramadhan. Uji nama akan melewatkannya.
//
// Bedanya dengan Musim Dingin: jendela ini TIDAK bergeser menurut "hari ini",
// jadi ia tidak ikut lewat parameter seperti `musimDinginWindow`. Cukup tabel
// konstanta — dan karena itu tanda tangan matchesPackageType tidak berubah.
//
// Tabelnya SENGAJA hanya memuat tahun yang tanggalnya sudah diperiksa manusia.
// Tidak ada perhitungan Hijriah otomatis di sini: awal Ramadhan versi kalender
// dan versi sidang isbat bisa beda sehari, dan filter publik tidak boleh
// bergeser sendiri. Menambah tahun = menambah satu baris.
//
// Nilai di bawah memakai Umm al-Qura: 1 Ramadhan 1448 = 8 Feb 2027, hari
// terakhir (29 Ramadhan) = 8 Mar 2027, 1 Syawal = 9 Mar 2027.

/** Awal & akhir bulan Ramadhan dalam Masehi, per tahun Hijriah. */
const RAMADHAN_MASEHI = {
  1448: { mulai: '2027-02-08', akhir: '2027-03-08' },
};

/** Padding jendela: paket yang berangkat sedikit sebelum/sesudah tetap "Ramadhan". */
const RAMADHAN_PAD_SEBELUM_HARI = 7;
const RAMADHAN_PAD_SESUDAH_HARI = 5;

const SATU_HARI_MS = 24 * 60 * 60 * 1000;

function geserIsoHari(iso, hari) {
  const dt = parseIsoDateUtc(iso);
  if (!dt) return null;
  return new Date(dt.getTime() + hari * SATU_HARI_MS).toISOString().slice(0, 10);
}

/**
 * Jendela berpadding per tahun Hijriah, dihitung sekali saat modul dimuat.
 * Batas INKLUSIF di dua sisi. Untuk 1448: 2027-02-01 s/d 2027-03-13.
 */
export const RAMADHAN_WINDOWS = Object.entries(RAMADHAN_MASEHI)
  .map(([tahunHijriah, bulan]) => ({
    tahunHijriah: Number(tahunHijriah),
    mulai: geserIsoHari(bulan.mulai, -RAMADHAN_PAD_SEBELUM_HARI),
    akhir: geserIsoHari(bulan.akhir, RAMADHAN_PAD_SESUDAH_HARI),
  }))
  .filter(w => w.mulai && w.akhir);

/** Tanggal berangkat (YYYY-MM-DD) jatuh di salah satu jendela Ramadhan terdaftar. */
export function isRamadhanDeparture(iso) {
  if (!parseIsoDateUtc(iso)) return false;
  // Perbandingan string aman: ISO 'YYYY-MM-DD' urut leksikografis = urut waktu,
  // dan bentuknya sudah divalidasi di atas.
  const s = String(iso);
  return RAMADHAN_WINDOWS.some(w => s >= w.mulai && s <= w.akhir);
}

/**
 * Tipe paket yang sebetulnya menunjuk sebuah TIER harga, bukan destinasi.
 * Keanggotaannya mengikuti apa yang benar-benar DIJUAL paket, bukan namanya:
 * cleanBrochurePackageName membuang frasa "MIX PAKET RAHMAH & UHUD" utuh, jadi
 * paket yang menjual tier RAHMAH kehilangan tokennya dan tak pernah muncul di
 * filter "Umroh Rahmah" — sementara bentuk tanpa "&" tetap lolos. Di data 1448
 * ada 3 paket yang menjual RAHMAH tanpa menyebutnya di nama.
 */
export const TIER_FOR_PACKAGE_TYPE = {
  [PACKAGE_TYPE_UMROH_RAHMAH]: 'RAHMAH',
};

function normalizeTierName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

/**
 * `subject.tiers === null` berarti TIDAK DIKETAHUI (respons API brosur versi
 * lama yang belum mengirim rincian tier) — bukan "tahu tidak punya". Di kasus
 * itu saja keanggotaan tier jatuh balik ke uji nama, supaya filter tidak
 * mendadak kosong. Adapter Jadwal selalu tahu tier-nya, jadi tak pernah null.
 */
function sellsTier(subject, tierName) {
  const wanted = normalizeTierName(tierName);
  if (!wanted) return false;
  const tiers = subject?.tiers;
  if (!Array.isArray(tiers)) {
    return String(subject?.nama || '').toUpperCase().split(/[^A-Z0-9]+/).includes(tierName.toUpperCase());
  }
  return tiers.some(t => normalizeTierName(t) === wanted);
}

function isPromoSubject(subject) {
  return subject?.isPromo === true || /\bPROMO\b/i.test(String(subject?.nama || ''));
}

/**
 * Keanggotaan satu paket pada satu tipe. Urutannya penting: empat tipe pertama
 * BUKAN kategori eksklusif (sebuah paket bisa sekaligus "Plus Turki" dan
 * "Kereta Cepat", atau promo dan musim dingin, atau Ramadhan dan Plus Badar),
 * jadi mereka tidak lewat derivePackageType yang memilih SATU tipe per paket.
 */
export function matchesPackageType(subject, type, musimDinginWindow) {
  if (!subject || !type) return false;
  if (type === PACKAGE_TYPE_UMROH_MUSIM_DINGIN) {
    return isMusimDinginDeparture(subject.departureIso, musimDinginWindow);
  }
  if (type === PACKAGE_TYPE_UMROH_RAMADHAN) {
    return isRamadhanDeparture(subject.departureIso);
  }
  if (type === PACKAGE_TYPE_UMROH_PROMO) return isPromoSubject(subject);
  if (type === PACKAGE_TYPE_KERETA_CEPAT) return hasKeretaCepat(subject.nama);
  const tier = TIER_FOR_PACKAGE_TYPE[type];
  if (tier) return sellsTier(subject, tier);
  return derivePackageType(subject.nama) === type;
}

/** Urutan kanonik roster: 6 tipe non-destinasi dulu, lalu PLUS * sesuai PACKAGE_TYPES. */
const PACKAGE_TYPE_ORDER = [
  PACKAGE_TYPE_UMROH_SAJA,
  PACKAGE_TYPE_UMROH_MUSIM_DINGIN,
  PACKAGE_TYPE_UMROH_RAMADHAN,
  PACKAGE_TYPE_UMROH_RAHMAH,
  PACKAGE_TYPE_UMROH_PROMO,
  PACKAGE_TYPE_KERETA_CEPAT,
  ...PACKAGE_TYPES.map(t => t.value),
];

const PACKAGE_TYPE_LABELS = {
  [PACKAGE_TYPE_UMROH_SAJA]: 'Umroh Saja',
  [PACKAGE_TYPE_UMROH_MUSIM_DINGIN]: 'Umroh Musim Dingin',
  [PACKAGE_TYPE_UMROH_RAMADHAN]: 'Umroh Ramadhan',
  [PACKAGE_TYPE_UMROH_RAHMAH]: 'Umroh Rahmah',
  [PACKAGE_TYPE_UMROH_PROMO]: 'Umroh Promo',
  [PACKAGE_TYPE_KERETA_CEPAT]: 'Kereta Cepat',
};

/** Label dropdown. PLUS * hanya menurunkan kata pertama: 'PLUS TURKI' → 'Plus TURKI'. */
export function packageTypeLabel(type) {
  const value = String(type || '');
  return PACKAGE_TYPE_LABELS[value] || value.replace(/^PLUS /, 'Plus ') || value;
}

export function isPackageType(type) {
  return PACKAGE_TYPE_ORDER.includes(String(type || ''));
}

/**
 * Opsi sub-filter, urut kanonik, HANYA yang punya minimal satu paket cocok —
 * jadi tidak ada opsi yang berujung nol hasil. Panggil dengan himpunan paket
 * yang sama dengan yang akan difilter (di Jadwal: yang masih punya kursi).
 */
export function listPackageTypeOptions(subjects, musimDinginWindow) {
  const list = Array.isArray(subjects) ? subjects : [];
  const options = [];
  for (const type of PACKAGE_TYPE_ORDER) {
    if (list.some(s => matchesPackageType(s, type, musimDinginWindow))) {
      options.push({ value: type, label: packageTypeLabel(type) });
    }
  }
  return options;
}

/** 'UMROH RAHMAH' ⇄ 'umroh-rahmah' — dipakai query `?tipe=` di halaman Jadwal. */
export function packageTypeSlug(type) {
  return String(type || '').toLowerCase().replace(/\s+/g, '-');
}

export function packageTypeFromSlug(slug) {
  const wanted = String(slug || '').toLowerCase().replace(/[\s-]+/g, '');
  return PACKAGE_TYPE_ORDER.find(t => t.toLowerCase().replace(/\s+/g, '') === wanted) || null;
}

// ============================================
// Adapter per halaman
// ============================================

/** BrochurePackage (GET /api/ai-tools/brosur-jadwal-bulan). */
export function brochureTypeSubject(pkg) {
  const tiers = Array.isArray(pkg?.tiers) && pkg.tiers.length > 0
    ? pkg.tiers.map(t => t?.tier)
    : null; // null = belum dikirim backend → keanggotaan tier pakai uji nama
  return {
    nama: String(pkg?.nama || ''),
    isPromo: pkg?.isPromo === true,
    departureIso: String(pkg?.berangkat_tgl || ''),
    tiers,
  };
}

/**
 * UmrohPackage (halaman Jadwal publik). Tier diambil dari KUNCI `pkg.harga`
 * (passthrough `paket_harga` AWAPI) — bukan dari listBrochureTiers yang
 * menyaring tier tanpa harga kamar terpakai. Alasannya: kartu Jadwal merender
 * seluruh tier di `harga`, jadi keanggotaan filter mengikuti apa yang benar-benar
 * terlihat di kartu. Di data 1448 kedua aturan memberi hasil identik.
 * `harga` bisa berbentuk array kosong (baris placeholder WAITINGLIST) — itu
 * berarti "tahu tidak ada tier", bukan "tidak tahu", jadi hasilnya [].
 */
export function umrohTypeSubject(pkg) {
  const harga = pkg?.harga;
  const tiers = harga && typeof harga === 'object' && !Array.isArray(harga) ? Object.keys(harga) : [];
  return {
    nama: String(pkg?.nama || ''),
    isPromo: pkg?.isPromo === true,
    departureIso: String(pkg?.keberangkatan?.tgl || ''),
    tiers,
  };
}
