/**
 * Deklarasi tipe untuk src/lib/pwa/refresh-registry.js — tumpukan penyegar
 * halaman aktif yang dipakai gestur tarik-untuk-segarkan.
 */

/** Mendaftarkan penyegar; kembaliannya melepas pendaftaran tersebut. */
export function pushRefreshHandler(handler: () => unknown): () => void;

/** Ada penyegar terdaftar? Snapshot untuk useSyncExternalStore. */
export function getRefreshAvailability(): boolean;

export function subscribeRefreshHandlers(listener: () => void): () => void;

/** Jalankan penyegar teratas; `false` bila tidak ada yang terdaftar. */
export function runActiveRefresh(): Promise<boolean>;

/** Hanya untuk tes. */
export function resetRefreshHandlers(): void;
