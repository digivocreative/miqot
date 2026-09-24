/**
 * Kapan coach mark tombol "hanya seat tersedia" boleh tampil lagi.
 *
 * Aturannya: tiap kali tombol matanya MUNCUL (paling sering: pindah dari Jenis
 * Paket → SEAT TERSEDIA ke filter lain), tapi paling sering sekali per 4 jam.
 * Jamnya mulai saat gelembung benar-benar tampil, bukan saat ditutup — jadi
 * yang mengabaikannya pun tidak dikejar di tiap perpindahan filter.
 *
 * Dipisah dari komponennya supaya keputusannya bisa diuji tanpa DOM — lihat
 * tests/jadwal-availability-hint.test.js. Aturan jam masa depan meniru callout
 * stiker Brosur (src/lib/stickerPromoGate.js).
 */

/**
 * v1 menyimpan '1' = "sudah lihat, jangan tampil lagi selamanya". Aturan 4 jam
 * wajib menjangkau pengunjung lama juga, jadi kuncinya diganti (bukan nilai v1
 * yang ditafsir ulang). Isinya kini stempel waktu tampil terakhir (ms).
 */
export const AVAILABILITY_HINT_KEY = 'jadwal-availability-hint-v2';

export const AVAILABILITY_HINT_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Bagian localStorage yang dipakai di sini — cukup segini buat diuji. */
interface HintStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Cadangan saat localStorage menolak (Safari private, iframe pihak ketiga).
 * Tanpa ini gelembung menyembul di SETIAP perpindahan filter; dengan ini jeda
 * 4 jam tetap berlaku selama halaman hidup.
 */
let memoryShownAt: number | null = null;

function resolveStorage(storage?: HintStorage | null): HintStorage | null {
  if (storage) return storage;
  // `window` tidak ada saat prerender, dan MENGAKSES `localStorage` saja sudah
  // bisa melempar (iframe pihak ketiga dengan cookie diblokir).
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readShownAt(storage?: HintStorage | null): number | null {
  const store = resolveStorage(storage);
  if (!store) return memoryShownAt;
  try {
    const raw = store.getItem(AVAILABILITY_HINT_KEY);
    const at = raw === null ? NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return memoryShownAt;
  }
}

/**
 * Boleh tampil? Belum pernah tampil, atau tampil terakhir ≥ 4 jam lalu.
 *
 * Stempel di masa depan (jam perangkat sempat maju lalu dibetulkan) dianggap
 * basi — kalau tidak, gelembungnya tersandera sampai jam itu lewat.
 */
export function shouldShowAvailabilityHint(storage?: HintStorage | null, now: number = Date.now()): boolean {
  const shownAt = readShownAt(storage);
  if (shownAt === null) return true;
  const elapsed = now - shownAt;
  return elapsed < 0 || elapsed >= AVAILABILITY_HINT_INTERVAL_MS;
}

/** Catat saat gelembung tampil. Gagal tulis → cadangan memori. */
export function markAvailabilityHintShown(storage?: HintStorage | null, now: number = Date.now()): void {
  const store = resolveStorage(storage);
  if (!store) {
    memoryShownAt = now;
    return;
  }
  try {
    store.setItem(AVAILABILITY_HINT_KEY, String(now));
  } catch {
    memoryShownAt = now;
  }
}
