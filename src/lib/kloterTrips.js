// Data LENGKAP semua kloter (nama, umur, nomor HP jamaah) untuk Node:
// server.js (OG meta + endpoint persiapan), skrip, dan tes. Kode browser tidak
// boleh mengimpor berkas ini — rute klien memuat satu kloter lewat
// loadKloterTrip(). Daftar kloternya tetap satu: loader di ./kloterSlugs.js.

import { KLOTER_SLUGS, loadKloterTrip } from './kloterSlugs.js';

export const KLOTER_TRIPS = await Promise.all(KLOTER_SLUGS.map((slug) => loadKloterTrip(slug)));

export function findKloterTripBySlug(segment) {
  const normalized = String(segment || '').trim().toLowerCase();
  return KLOTER_TRIPS.find((trip) => trip.slug === normalized) || null;
}
