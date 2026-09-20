/**
 * Siapa yang menyegarkan halaman yang sedang dilihat.
 *
 * Dashboard bukan satu halaman: tiap tab memuat datanya sendiri, dan sebagian
 * dilazy-load. Gestur tarik-untuk-segarkan cuma satu dan hidup di shell, jadi
 * shell butuh cara menanyakan "halaman yang sedang tampil ini, bagaimana cara
 * menyegarkannya?" tanpa harus tahu daftar halamannya.
 *
 * Bentuknya TUMPUKAN, bukan satu slot: halaman anak (feed Teras) mendaftar di
 * atas pendaftaran shell dan otomatis mengembalikan giliran begitu ia dilepas.
 * Penghapusan dicari per identitas di seluruh tumpukan — urutan unmount React
 * tidak dijamin, jadi "pop yang teratas" akan membuang milik orang lain.
 *
 * Halaman yang TIDAK mendaftar sengaja dibiarkan tanpa gestur: di sana PTR
 * bawaan Chrome Android tetap hidup (lihat kelas `pull-refresh-host` di
 * src/components/pwa/PullToRefresh.tsx), jadi pengguna tidak kehilangan apa pun.
 */

/** @type {Array<() => unknown>} */
const handlers = [];
/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  listeners.forEach(listener => listener());
}

/**
 * Daftarkan penyegar untuk halaman yang sedang tampil. Kembaliannya melepas
 * pendaftaran itu — panggil di cleanup efek.
 */
export function pushRefreshHandler(handler) {
  if (typeof handler !== 'function') return () => {};
  handlers.push(handler);
  notify();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = handlers.lastIndexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
    notify();
  };
}

/**
 * Snapshot untuk useSyncExternalStore. SENGAJA boolean, bukan fungsinya:
 * identitas fungsi berubah tiap render pemilik dan akan memicu render tak
 * berujung di pelanggan store.
 */
export function getRefreshAvailability() {
  return handlers.length > 0;
}

export function subscribeRefreshHandlers(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Jalankan penyegar teratas. Selalu mengembalikan Promise supaya pemanggil bisa
 * menunggu tanpa peduli penanganya sinkron atau async; penangan yang melempar
 * ditolak ke pemanggil (indikator yang menutup diri dengan rapi ada di sana).
 */
export function runActiveRefresh() {
  const handler = handlers[handlers.length - 1];
  if (!handler) return Promise.resolve(false);
  // try/catch, bukan Promise.resolve(handler()) polos: penangan sinkron yang
  // melempar akan melempar DI SINI — bukan menolak Promise-nya — dan pemanggil
  // yang cuma memasang .catch() tidak akan pernah melihatnya.
  try {
    return Promise.resolve(handler()).then(() => true);
  } catch (error) {
    return Promise.reject(error);
  }
}

/** Hanya untuk tes: kosongkan tumpukan antar-kasus. */
export function resetRefreshHandlers() {
  handlers.length = 0;
  notify();
}
