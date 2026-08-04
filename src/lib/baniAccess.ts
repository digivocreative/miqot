// Sisi klien dari lib/bani-access.js — Bani terbuka untuk semua agent yang
// punya slug (yaitu semua agent yang bisa login). Dipertahankan sebagai helper
// supaya gate-nya tetap satu tempat kalau nanti dibatasi lagi. Server tetap
// yang menegakkan aturannya; helper ini hanya menyembunyikan UI-nya.
export function isBaniEnabledForSlug(slug?: string | null): boolean {
  return Boolean(String(slug || '').trim());
}
