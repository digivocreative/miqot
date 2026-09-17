// Riwayat sub-halaman kloter (/26SEP2026/doa, /26SEP2026/itinerary, ...). Murni tanpa
// React supaya urutan entri riwayatnya bisa diuji di node.
import { backOr, pushAppState, replaceAppState } from '@/lib/appHistory';
import { getKloterSubPagePath, type KloterTrip } from '@/lib/kloterLanding.js';
import type { KloterSubPage } from '@/lib/kloterSlugs.js';

/** Buka sub-halaman (atau daftar jamaah) sebagai entri riwayat baru. */
export function pushKloterSubPage(trip: KloterTrip, next: KloterSubPage | null) {
  const nextPath = getKloterSubPagePath(trip, next);
  if (window.location.pathname !== nextPath) pushAppState({ kloterSubPage: next }, nextPath);
}

/**
 * Tombol kembali sub-halaman = mundur di riwayat (sama dengan gestur back HP). Kalau
 * mendorong entri daftar jamaah baru, back HP berikutnya membuka lagi sub-halaman yang
 * baru ditinggal. Sub-halaman yang dibuka langsung dari link (tanpa riwayat dalam app)
 * diganti ke daftar jamaah; `showHome` hanya dipanggil di jalur itu, jalur mundur
 * diselesaikan listener popstate.
 */
export function backToKloterHome(trip: KloterTrip, showHome: () => void) {
  backOr(() => {
    showHome();
    const homePath = getKloterSubPagePath(trip, null);
    if (window.location.pathname !== homePath) replaceAppState({ kloterSubPage: null }, homePath);
  });
}
