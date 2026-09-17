// Keputusan saat /api/version melaporkan entry chunk yang berbeda dari yang sedang jalan.
//
// Dulu: selalu unregister SW + hapus SEMUA cache + reload paksa → setiap deploy memaksa
// unduh ulang seluruh precache dan membuang teks yang sedang diketik. Kini jalur normal
// Workbox (SW baru dipasang → menunggu → ditawarkan lewat toast) diutamakan; perbaikan
// hanya untuk SW yang benar-benar macet (build baru ada tapi tidak ada SW baru sama sekali).

export type VersionAction = 'none' | 'wait' | 'prompt' | 'repair';

export interface VersionInput {
  runningEntry: string;
  deployedEntry: string;
  swWaiting: boolean;
  swInstalling: boolean;
  /** Entry yang sudah pernah diperbaiki di sesi tab ini (anti-ulang). */
  repairedFor: string | null;
}

export function decideVersionAction(input: VersionInput): VersionAction {
  const { runningEntry, deployedEntry } = input;
  if (!runningEntry || !deployedEntry || runningEntry === deployedEntry) return 'none';
  if (input.swWaiting) return 'prompt';
  if (input.swInstalling) return 'wait';
  if (input.repairedFor === deployedEntry) return 'prompt';
  return 'repair';
}

/**
 * Lepas SW yang macet dan buang HANYA cache precache-nya. Cache runtime (foto agent,
 * media hotel, gambar, chunk, font) tetap: isinya ber-URL immutable dan masih valid.
 */
export async function repairStuckServiceWorker(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('workbox-precache')).map((key) => caches.delete(key)));
    }
  } catch {
    /* ignore — muat ulang tetap ditawarkan */
  }
}
