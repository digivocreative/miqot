// Koordinator entri riwayat untuk overlay (modal, sheet, penampil media) yang ditutup
// gestur back. Dipakai lewat hook src/hooks/useBackToClose.ts; tanpa React supaya teruji.
//
// Tiap overlay yang terbuka menambah satu entri (URL sama) bertanda token. Back membuang
// entri itu → overlay ditutup. Ditutup lewat UI → entri dibuang dengan traversal mundur.
// Dua jebakan yang ditangani (terbukti di Chromium):
// - Tutup A lalu buka B dalam handler yang sama: traversal milik A selesai SETELAH B
//   menambah entri dan ikut membuangnya. Overlay baru menunggu traversal yang sedang
//   berjalan sebelum menambah entri.
// - Beberapa overlay ditutup dalam satu render (induk + anak, urutan cleanup apa pun):
//   dilepas bersama dalam satu history.go(-n), tidak menyisakan tekan back yang kosong.

const OVERLAY_KEY = '__overlay';
const TRAVERSAL_TIMEOUT_MS = 500;

type StateRecord = Record<string, unknown> | null;

let seq = 0;
// Bagian unik per muat halaman: tanpa ini token `overlay-1` bisa sama dengan entri overlay sisa
// sebelum reload, dan back pertama pada overlay baru tidak menutup apa-apa.
const PAGE_ID = Math.random().toString(36).slice(2, 10);
let stack: string[] = [];
const toRelease = new Set<string>();
let flushScheduled = false;
let pendingTraversal: Promise<void> | null = null;
let listenerTarget: Window | null = null;

function currentToken(): string | null {
  const token = (window.history.state as StateRecord)?.[OVERLAY_KEY];
  return typeof token === 'string' ? token : null;
}

// Entri di atas token yang sekarang aktif sudah hilang dari riwayat (back / go).
function onGlobalPopState() {
  const token = currentToken();
  const index = token ? stack.lastIndexOf(token) : -1;
  stack.splice(index + 1);
}

function ensureGlobalListener() {
  if (listenerTarget === window) return;
  listenerTarget = window;
  stack = [];
  toRelease.clear();
  flushScheduled = false;
  pendingTraversal = null;
  // Didaftarkan sebelum listener tiap overlay → tumpukan sudah mutakhir saat mereka membacanya.
  window.addEventListener('popstate', onGlobalPopState);
}

function traverseBack(count: number) {
  pendingTraversal = new Promise<void>((resolve) => {
    let timer = 0;
    const done = () => {
      window.removeEventListener('popstate', done);
      window.clearTimeout(timer);
      pendingTraversal = null;
      resolve();
    };
    timer = window.setTimeout(done, TRAVERSAL_TIMEOUT_MS);
    window.addEventListener('popstate', done);
  });
  window.history.go(-count);
}

function flushReleases() {
  flushScheduled = false;
  let count = 0;
  // Hanya entri yang masih di PUNCAK riwayat yang dibuang dengan traversal. Kalau rute app
  // sudah menambah entri di atasnya, cukup dilupakan (back berikutnya melewatinya biasa).
  if (currentToken() === stack[stack.length - 1]) {
    while (stack.length > 0 && toRelease.has(stack[stack.length - 1])) {
      toRelease.delete(stack.pop() as string);
      count += 1;
    }
  }
  for (const token of toRelease) {
    const index = stack.indexOf(token);
    if (index !== -1) stack.splice(index, 1);
  }
  toRelease.clear();
  if (count > 0) traverseBack(count);
}

/**
 * Tambah entri riwayat untuk overlay yang baru terbuka. `onClosedByBack` dipanggil bila
 * entri itu dibuang oleh back. Kembalikan fungsi pelepas untuk dipanggil saat overlay
 * ditutup dengan cara lain (tombol, backdrop, unmount).
 */
export function openOverlayEntry(onClosedByBack: () => void): () => void {
  ensureGlobalListener();
  seq += 1;
  const token = `overlay-${PAGE_ID}-${seq}`;
  let pushed = false;
  let finished = false;

  const push = () => {
    if (finished) return;
    const state = (window.history.state as StateRecord) ?? {};
    window.history.pushState({ ...state, [OVERLAY_KEY]: token }, '', window.location.href);
    stack.push(token);
    pushed = true;
  };

  // Ditunda satu tick: StrictMode (dev) menjalankan efek → cleanup → efek seketika, dan
  // traversal milik overlay yang baru ditutup mungkin masih berjalan.
  const timer = window.setTimeout(() => {
    if (pendingTraversal) void pendingTraversal.then(push);
    else push();
  }, 0);

  const onPopState = () => {
    if (!pushed || finished || stack.includes(token)) return;
    finished = true;
    window.removeEventListener('popstate', onPopState);
    onClosedByBack();
  };
  window.addEventListener('popstate', onPopState);

  return () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    window.removeEventListener('popstate', onPopState);
    if (!pushed || !stack.includes(token)) return;
    toRelease.add(token);
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flushReleases);
    }
  };
}

export function overlayStackSize(): number {
  return stack.length;
}
