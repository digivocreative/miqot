// Sisi klien dari lib/community-access.js — Teras terbuka untuk semua agent
// yang punya slug (yaitu semua agent yang bisa login). Dipertahankan sebagai
// helper supaya gate-nya tetap satu tempat kalau nanti dibatasi lagi.
export function isCommunityEnabledForAgent(slug?: string | null): boolean {
  return Boolean(String(slug || '').trim());
}

// Kembar klien dari canModerateCommunityContent di lib/community-access.js:
// tombol "Hapus" muncul untuk penulisnya sendiri, atau untuk admin pada
// kiriman/komentar agent lain. Server tetap yang menegakkan aturannya.
export function canDeleteCommunityEntry(
  agent: { role?: string | null } | null | undefined,
  entry: { is_own?: boolean } | null | undefined,
): boolean {
  if (entry?.is_own) return true;
  return agent?.role === 'admin';
}
