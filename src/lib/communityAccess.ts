// Sisi klien dari lib/community-access.js — Teras terbuka untuk semua agent
// yang punya slug (yaitu semua agent yang bisa login). Dipertahankan sebagai
// helper supaya gate-nya tetap satu tempat kalau nanti dibatasi lagi.
export function isCommunityEnabledForAgent(slug?: string | null): boolean {
  return Boolean(String(slug || '').trim());
}
