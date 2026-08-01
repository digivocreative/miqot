// Mode halaman Brosur dan slug URL-nya.
//
// Dipisah ke modul sendiri karena DUA komponen membacanya: BrochureSchedulePage
// (pemilik state mode) dan DashboardLayout (menyembunyikan toggle HARI/SEAT
// yang tidak berlaku di mode Paket). DashboardLayout me-lazy-load
// BrochureSchedulePage, jadi helper ini tidak boleh tinggal di sana — meng-
// import named export dari modul lazy akan menariknya ke bundle utama dan
// membatalkan code-split-nya.

export type BrosurMode = 'jadwal' | 'paket';

const PAKET_PATH_SEGMENT = 'paket';

/** Base path tanpa segmen mode. Halaman Brosur dipasang di dua rute
 *  (/dashboard/brosur dan /dashboard/ai-tools/brosur-jadwal), jadi base-nya
 *  dibaca dari URL yang sedang aktif, bukan dihardcode. */
function currentBrosurBasePath(): string {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path.replace(new RegExp(`/${PAKET_PATH_SEGMENT}$`), '') || '/dashboard/brosur';
}

/** Sumber kebenaran mode = URL, supaya reload/bookmark/link yang dibagikan
 *  mendarat di mode yang sama. */
export function readBrosurModeFromPath(): BrosurMode {
  const segments = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/');
  return segments[segments.length - 1] === PAKET_PATH_SEGMENT ? 'paket' : 'jadwal';
}

export function brosurModePath(mode: BrosurMode): string {
  const base = currentBrosurBasePath();
  return mode === 'paket' ? `${base}/${PAKET_PATH_SEGMENT}` : base;
}
