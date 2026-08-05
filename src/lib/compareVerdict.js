// Kesimpulan perbandingan dua paket-tier: siapa lebih murah, hotelnya siapa yang
// lebih baik, dan seat siapa yang lebih longgar — bahan hero di PDF Bandingkan
// Paket.
//
// Semuanya FAIL-CLOSED. Data yang kurang menghasilkan `null` (chip diam), bukan
// tebakan: dokumen ini dikirim agent ke jamaah, dan "PAKET B hotelnya lebih
// bagus" yang salah lebih merusak daripada chip yang kosong.
//
// Sisi (`a`/`b`) sengaja diterima dalam bentuk yang SUDAH diresolusi — harga per
// tipe kamar, bintang, jarak, sisa seat — bukan (pkg, tier). Bintang & jarak
// butuh lookupHotelMetadata yang tinggal di berkas .ts; menariknya ke sini akan
// membuat modul ini tak bisa diuji `node --test`. Lihat packageTiers.js untuk
// aturan tier yang menghasilkan angka-angka itu.
//
// Murni supaya bisa diuji di tests/compare-verdict.test.js.

/** Urut dari kamar termurah — dipakai headlinePriceGap memilih angka utama. */
const ROOM_ORDER = ['Quard', 'Triple', 'Double'];

function num(value) {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * @type {import('./compareVerdict').parseDistanceMeters}
 */
export function parseDistanceMeters(text) {
  const raw = String(text ?? '').trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(km|meter|m)(?![a-z])/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2] === 'km' ? Math.round(value * 1000) : Math.round(value);
}

/**
 * @type {import('./compareVerdict').headlinePriceGap}
 */
export function headlinePriceGap(a, b) {
  for (const room of ROOM_ORDER) {
    const pa = num(a?.prices?.[room]);
    const pb = num(b?.prices?.[room]);
    if (!pa || !pb) continue;
    // Kamar termurah yang bisa dibandingkan menutup pencarian, termasuk saat
    // harganya sama: turun ke tipe berikutnya hanya karena di sana ada selisih
    // sama dengan memilih angka yang paling enak dilihat.
    if (pa === pb) return { room, diff: 0, cheaper: null };
    return { room, diff: Math.abs(pa - pb), cheaper: pa < pb ? 'a' : 'b' };
  }
  return null;
}

/**
 * @type {import('./compareVerdict').priceWinner}
 */
export function priceWinner(a, b) {
  let winsA = 0;
  let winsB = 0;
  let total = 0;
  for (const room of ROOM_ORDER) {
    const pa = num(a?.prices?.[room]);
    const pb = num(b?.prices?.[room]);
    if (!pa || !pb) continue;
    total += 1;
    if (pa < pb) winsA += 1;
    else if (pb < pa) winsB += 1;
  }
  if (!total || winsA === winsB) return null;
  return winsA > winsB ? { side: 'a', wins: winsA, total } : { side: 'b', wins: winsB, total };
}

function starSum(side) {
  const mekkah = num(side?.hotels?.mekkah?.stars);
  const madinah = num(side?.hotels?.madinah?.stars);
  if (!mekkah || !madinah) return null;
  return mekkah + madinah;
}

/**
 * @type {import('./compareVerdict').hotelWinner}
 */
export function hotelWinner(a, b) {
  const sa = starSum(a);
  const sb = starSum(b);
  if (sa === null || sb === null) return null;
  if (sa !== sb) return { side: sa > sb ? 'a' : 'b', reason: 'bintang' };
  for (const kota of ['mekkah', 'madinah']) {
    const da = parseDistanceMeters(a?.hotels?.[kota]?.distance);
    const db = parseDistanceMeters(b?.hotels?.[kota]?.distance);
    if (da === null || db === null) continue;
    if (da !== db) return { side: da < db ? 'a' : 'b', reason: 'jarak' };
  }
  return null;
}

/**
 * @type {import('./compareVerdict').seatWinner}
 */
export function seatWinner(a, b) {
  const sa = num(a?.seatSisa);
  const sb = num(b?.seatSisa);
  if (sa === sb) return null;
  return { side: sa > sb ? 'a' : 'b', a: sa, b: sb };
}

/**
 * @type {import('./compareVerdict').buildCompareVerdict}
 */
export function buildCompareVerdict(a, b) {
  return {
    gap: headlinePriceGap(a, b),
    price: priceWinner(a, b),
    hotel: hotelWinner(a, b),
    seat: seatWinner(a, b),
  };
}
