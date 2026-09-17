// Riwayat navigasi dalam-app yang sadar "kedalaman".
//
// Setiap entri yang dibuat app lewat pushAppState membawa kedalaman (> 0). Tombol
// "Kembali" di app memakai backOr(): kalau entri saat ini lahir dari navigasi dalam app,
// mundur dengan history.back() (sama seperti gestur back Android); kalau layar dibuka
// langsung (deep link, app diluncurkan, muat ulang), jalankan fallback — biasanya
// replaceAppState ke layar induk — supaya back tidak menumpuk entri atau keluar dari app.

const DEPTH_KEY = '__appDepth';

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
  window.history.replaceState({ ...state, [DEPTH_KEY]: currentDepth() }, '', url);
}

export function canGoBackInApp(): boolean {
  return currentDepth() > 0;
}

export function backOr(fallback: () => void): void {
  if (canGoBackInApp()) window.history.back();
  else fallback();
}
