// Registri ringan halaman kloter (/26SEP2026, /12SEP2026, ...) untuk rute klien
// di src/main.tsx: cukup slug dan sub-halaman. Data jamaah tiap kloter (nama,
// umur, nomor HP) dimuat lewat import() dinamis — satu chunk per kloter, hanya
// saat rutenya dirender. JANGAN impor statis ./kloter/* dari sini atau dari
// kode browser lain: modul ini ikut chunk entry yang diunduh setiap pengunjung.
//
// Menambah kloter = tambah berkas data di ./kloter/ + daftarkan loader-nya di
// sini. server.js dan tes membaca daftar yang sama lewat ./kloterTrips.js.

const KLOTER_TRIP_LOADERS = {
  '26sep2026': () => import('./kloter/kloter45.js'),
  '12sep2026': () => import('./kloter/kloter39.js'),
  '19sep2026': () => import('./kloter/kloter41.js'),
};

// Slug internal huruf kecil: RESERVED_SPA_SLUGS dan segmen URL selalu
// dibandingkan lowercase. Tautan yang dibagikan (publicPath) huruf besar.
export const KLOTER_SLUGS = Object.keys(KLOTER_TRIP_LOADERS);

export function resolveKloterSlug(segment) {
  const normalized = String(segment || '').trim().toLowerCase();
  return KLOTER_SLUGS.includes(normalized) ? normalized : null;
}

// Sub-halaman di bawah tiap kloter (menu di atas kolom cari).
export const KLOTER_SUB_PAGES = ['doa', 'dzikir', 'itinerary', 'room-list'];

export function resolveKloterSubPage(segment) {
  const normalized = String(segment || '').trim().toLowerCase();
  return KLOTER_SUB_PAGES.includes(normalized) ? normalized : null;
}

export async function loadKloterTrip(segment) {
  const slug = resolveKloterSlug(segment);
  if (!slug) throw new Error(`Kloter tidak dikenal: ${segment}`);
  const { default: trip } = await KLOTER_TRIP_LOADERS[slug]();
  return trip;
}
