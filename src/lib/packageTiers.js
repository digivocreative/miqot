// Tier paket umroh (HEMAT/UHUD/RAHMAH/PRIVATE) sebagai satuan yang bisa dipilih.
//
// `paket_harga` dan `paket_hotel` dari hulu adalah peta PER TIER: satu jadwal
// bisa menjual UHUD dan RAHMAH sekaligus, dengan hotel yang benar-benar berbeda
// (JBU1500: UHUD di ANJUM, HEMAT di AL MASSA GRAND, RAHMAH di MOVENPICK, dan
// hanya UHUD yang punya hotel Cairo). Menggabung tier — atau memakai
// `Object.keys(harga)[0]` — memasangkan harga satu tier dengan hotel tier lain.
//
// Pembagiannya: `tierHotelInfo` untuk apa pun yang dibeli per tier (harga,
// hotel, bintang, jarak), `packageCityHotels` untuk apa yang berlaku sejadwal
// (suhu, bendera negara, teks pencarian) — itinerary satu jadwal sama untuk
// semua tiernya, yang beda cuma hotelnya.
//
// Murni supaya bisa diuji di tests/package-tiers.test.js — sepupu sisi-klien
// dari listBrochureTiers di lib/brochure-schedule.js.

/** Infant sengaja di luar: itu harga per orang, bukan kamar. */
const ROOM_TYPES = ['Quard', 'Triple', 'Double', 'Single'];

/** Hulu memakai 'N/A' untuk kamar yang tidak dijual di tier itu. */
function toPrice(value) {
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function hargaMap(pkg) {
  return pkg && typeof pkg.harga === 'object' && pkg.harga ? pkg.harga : {};
}

function hotelMap(pkg) {
  return pkg && typeof pkg.hotel === 'object' && pkg.hotel ? pkg.hotel : {};
}

/**
 * @type {import('./packageTiers').tierStartingPrice}
 */
export function tierStartingPrice(pkg, tier) {
  const pricing = hargaMap(pkg)[tier];
  if (!pricing || typeof pricing !== 'object') return 0;
  let min = 0;
  for (const room of ROOM_TYPES) {
    const price = toPrice(pricing[room]);
    if (price > 0 && (min === 0 || price < min)) min = price;
  }
  return min;
}

/**
 * @type {import('./packageTiers').listPackageTiers}
 */
export function listPackageTiers(pkg) {
  return Object.keys(hargaMap(pkg)).filter((tier) => tierStartingPrice(pkg, tier) > 0);
}

/**
 * @type {import('./packageTiers').cheapestPackageTier}
 */
export function cheapestPackageTier(pkg) {
  let best = '';
  let bestPrice = 0;
  for (const tier of listPackageTiers(pkg)) {
    const price = tierStartingPrice(pkg, tier);
    if (bestPrice === 0 || price < bestPrice) {
      best = tier;
      bestPrice = price;
    }
  }
  if (best) return best;
  // Tak ada tier yang bisa dijual: pakai kunci pertama yang ada supaya hotel
  // dan sisa kartunya tetap tampil, bukan halaman kosong.
  return Object.keys(hargaMap(pkg))[0] || Object.keys(hotelMap(pkg))[0] || '';
}

/**
 * @type {import('./packageTiers').resolvePackageTier}
 */
export function resolvePackageTier(pkg, tier) {
  if (tier && listPackageTiers(pkg).includes(tier)) return tier;
  return cheapestPackageTier(pkg);
}

/**
 * @type {import('./packageTiers').tierHotelInfo}
 */
export function tierHotelInfo(pkg, tier) {
  const info = hotelMap(pkg)[tier];
  return info && typeof info === 'object' ? info : null;
}

/**
 * @type {import('./packageTiers').packageCityHotels}
 */
export function packageCityHotels(pkg) {
  const merged = {};
  for (const info of Object.values(hotelMap(pkg))) {
    if (!info || typeof info !== 'object') continue;
    for (const [key, value] of Object.entries(info)) {
      if (value && !merged[key]) merged[key] = value;
    }
  }
  return merged;
}

/**
 * @type {import('./packageTiers').tierRoomPrice}
 */
export function tierRoomPrice(pkg, tier, roomType) {
  const pricing = hargaMap(pkg)[tier];
  if (!pricing || typeof pricing !== 'object') return 0;
  return toPrice(pricing[roomType]);
}
