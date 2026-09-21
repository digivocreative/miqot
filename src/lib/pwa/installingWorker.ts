// Pantau service worker yang sedang `installing` sampai terpasang (masuk `waiting`).
//
// Registrasi workbox-window ditunda sampai load+idle (main.tsx ensureSwRegistered),
// sedangkan checkBuildVersion memanggil registration.update() ±4 dtk setelah eksekusi.
// Bila update() menang, SW baru sudah `installing` saat workbox register(): register()
// hanya menangani `.waiting` yang sudah ada dan memasang listener `updatefound`
// SESUDAHNYA (node_modules/workbox-window/Workbox.js), jadi SW itu tak pernah dilacak
// dan onNeedRefresh tak pernah dipanggil — pengguna tertinggal di shell lama tanpa
// toast sampai kebetulan pindah tab. Helper ini memantau langsung lewat `statechange`,
// tanpa bergantung pada workbox.

/**
 * Panggil `onInstalled` SEKALI saat `sw` mencapai state `installed` (= menunggu).
 * `redundant` (install gagal) atau state yang sudah lewat (activating/activated): diam.
 */
export function whenWorkerInstalled(sw: ServiceWorker, onInstalled: () => void): void {
  if (sw.state === 'installed') {
    onInstalled();
    return;
  }
  if (sw.state !== 'parsed' && sw.state !== 'installing') return;
  const onStateChange = () => {
    if (sw.state === 'parsed' || sw.state === 'installing') return;
    sw.removeEventListener('statechange', onStateChange);
    if (sw.state === 'installed') onInstalled();
  };
  sw.addEventListener('statechange', onStateChange);
}
