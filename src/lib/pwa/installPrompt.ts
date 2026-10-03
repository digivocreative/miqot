// Ajakan memasang aplikasi. `beforeinstallprompt` (Chrome/Edge/Samsung Internet) datang
// sekali per muat halaman, sering sebelum React mount — jadi ditangkap dari src/main.tsx.
// Hanya ditahan (preventDefault) di dashboard, tempat InstallAppCard menawarkannya;
// halaman publik tetap memakai UI pasang bawaan peramban. iOS tidak punya event ini:
// kartu menampilkan langkah "Bagikan → Tambahkan ke Layar Utama".

import { resolveInstallStart } from '../installScope.js';

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface InstallState {
  canPrompt: boolean;
  installed: boolean;
}

interface PromptEvent {
  preventDefault(): void;
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallWindow {
  location: { pathname: string };
  addEventListener(type: string, listener: (event: never) => void): void;
}

export function detectInstallPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

export function createInstallPrompt(win: InstallWindow, onInstalled?: (pathname: string) => void) {
  let deferred: PromptEvent | null = null;
  let state: InstallState = { canPrompt: false, installed: false };
  const listeners = new Set<() => void>();

  const setState = (next: InstallState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  win.addEventListener('beforeinstallprompt', ((event: PromptEvent) => {
    if (win.location.pathname.startsWith('/dashboard')) event.preventDefault();
    deferred = event;
    setState({ ...state, canPrompt: true });
  }) as (event: never) => void);

  win.addEventListener('appinstalled', (() => {
    deferred = null;
    setState({ canPrompt: false, installed: true });
    onInstalled?.(win.location.pathname);
  }) as (event: never) => void);

  return {
    getState: (): InstallState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
      const event = deferred;
      if (!event) return 'unavailable';
      deferred = null;
      setState({ ...state, canPrompt: false });
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') setState({ canPrompt: false, installed: true });
      return choice.outcome;
    },
  };
}

export type InstallPromptStore = ReturnType<typeof createInstallPrompt>;

// Pengunjung memasang dari halaman publik agent (/:slug, /:slug/jamaah) → catat ke agent
// itu. Dashboard sudah dicatat install_app di InstallAppCard. Impor dinamis supaya modul
// ini tetap bisa dimuat langsung oleh tes node (tanpa alias/resolusi tanpa ekstensi).
async function trackPublicInstall(pathname: string): Promise<void> {
  const start = resolveInstallStart(pathname);
  if (!start) return;
  try {
    const [{ AGENTS_DATA }, { getStoredSession }, { trackPublicEvent }] = await Promise.all([
      import('../../data/agents'),
      import('../authSession'),
      import('../../utils/analytics'),
    ]);
    const segment = start.split('/')[1].toLowerCase();
    // Hanya slug agent sungguhan (bukan landing kloter / path lain).
    const slug = Object.keys(AGENTS_DATA).find(key => key.toLowerCase() === segment);
    if (!slug) return;
    // Agent memasang halamannya sendiri — bukan pengunjung.
    if (getStoredSession()?.user?.slug?.toLowerCase() === segment) return;
    trackPublicEvent(slug, 'pwa_install_public', { scope: start.endsWith('/jamaah') ? 'portal' : 'jadwal' });
  } catch {
    // Analytics tidak boleh mengganggu pemasangan.
  }
}

let sharedStore: InstallPromptStore | null = null;

/** Dipanggil sekali dari src/main.tsx, sedini mungkin. */
export function initInstallPrompt(): InstallPromptStore {
  if (!sharedStore) sharedStore = createInstallPrompt(window, pathname => { void trackPublicInstall(pathname); });
  return sharedStore;
}

export function getInstallPromptStore(): InstallPromptStore {
  return initInstallPrompt();
}
