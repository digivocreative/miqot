/**
 * Ingatan "sudah pernah lihat" untuk coach mark tombol "hanya seat tersedia".
 *
 * Dipisah dari komponennya supaya keputusannya bisa diuji tanpa DOM — lihat
 * tests/jadwal-availability-hint.test.js. Pola kuncinya mengikuti
 * src/components/bio-editor/HintBanner.tsx (satu kunci, bersufiks versi).
 */

/**
 * Sufiks `-v1` bukan hiasan: kalau teks hint-nya diperbarui nanti, naikkan ke
 * `-v2` dan semua orang melihat versi barunya sekali lagi tanpa perlu tahu
 * apa pun soal nilai lama.
 */
export const AVAILABILITY_HINT_KEY = 'jadwal-availability-hint-v1';

/** Bagian localStorage yang dipakai di sini — cukup segini buat diuji. */
interface HintStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

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

/**
 * Boleh tampil? Hanya kalau browser ini belum pernah melihatnya.
 *
 * Gagal baca dijawab `true` (tampil), bukan `false`. Di Safari private mode
 * localStorage melempar, dan hint yang muncul dua kali jauh lebih murah
 * daripada pengunjung yang tidak pernah tahu tombolnya berfungsi apa.
 */
export function shouldShowAvailabilityHint(storage?: HintStorage | null): boolean {
  const store = resolveStorage(storage);
  if (!store) return true;
  try {
    return store.getItem(AVAILABILITY_HINT_KEY) !== '1';
  } catch {
    return true;
  }
}

/** Tandai sudah pernah dilihat. Gagal tulis diabaikan — ini bukan data penting. */
export function markAvailabilityHintSeen(storage?: HintStorage | null): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(AVAILABILITY_HINT_KEY, '1');
  } catch {
    /* storage ditolak — biarkan, hint muncul lagi lain kali */
  }
}
