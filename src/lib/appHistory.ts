// Riwayat navigasi dalam-app yang sadar "kedalaman".
//
// Setiap entri yang dibuat app lewat pushAppState membawa kedalaman (> 0). Tombol
// "Kembali" di app memakai backOr(): kalau entri saat ini lahir dari navigasi dalam app,
// mundur dengan history.back() (sama seperti gestur back Android); kalau layar dibuka
// langsung (deep link, app diluncurkan, muat ulang), jalankan fallback — biasanya
// replaceAppState ke layar induk — supaya back tidak menumpuk entri atau keluar dari app.

const DEPTH_KEY = '__appDepth';
// Penanda entri overlay milik src/lib/overlayHistory.ts.
const OVERLAY_KEY = '__overlay';

type StateRecord = Record<string, unknown>;

function currentDepth(): number {
  const state = window.history.state as StateRecord | null;
  const depth = Number(state?.[DEPTH_KEY]);
  return Number.isFinite(depth) && depth > 0 ? depth : 0;
}

export function pushAppState(state: StateRecord, url: string): void {
  window.history.pushState({ ...state, [DEPTH_KEY]: currentDepth() + 1 }, '', url);
}

export function replaceAppState(state: StateRecord, url?: string): void {
  // Entri overlay menyalin kedalaman halaman di bawahnya. Kalau entri itu diganti layar
  // tujuan (navigasi dari dalam modal), layar itu satu langkah di atas halaman tersebut.
  const current = window.history.state as StateRecord | null;
  const aboveOverlayPage = typeof current?.[OVERLAY_KEY] === 'string' ? 1 : 0;
  window.history.replaceState({ ...state, [DEPTH_KEY]: currentDepth() + aboveOverlayPage }, '', url);
}

export function canGoBackInApp(): boolean {
  return currentDepth() > 0;
}

export function backOr(fallback: () => void): void {
  if (canGoBackInApp()) window.history.back();
  else fallback();
}

/**
 * Halaman dokumen penuh (detail paket, kalkulasi, compare, share penerbangan): apakah entri
 * riwayat sebelumnya halaman app ini sendiri? Kalau ya, tombol Kembali cukup history.back() —
 * `location.href` ke induk menumpuk entri baru dan back Android berikutnya memantul ke sini lagi.
 * Navigation API menjawab persis (termasuk saat overlay useBackToClose meninggalkan entri maju
 * yang menggelembungkan history.length); tanpa API itu: referrer se-origin + riwayat > 1.
 * Link WhatsApp / tab baru → false, dan pemanggil mengganti (replace) ke halaman induk.
 */
export function hasInAppHistory(): boolean {
  const nav = (window as unknown as { navigation?: { canGoBack?: unknown } }).navigation;
  if (typeof nav?.canGoBack === 'boolean') return nav.canGoBack;
  if (window.history.length <= 1 || !document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
