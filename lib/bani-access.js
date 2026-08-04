// Bani (asisten AI in-app) terbuka untuk semua agent yang sudah login. Dulu
// dibatasi allowlist slug (nikita) saat masa pilot; sekarang satu-satunya
// syarat adalah punya akun agent — jadi gate-nya tinggal authMiddleware.
//
// Pola sengaja mencerminkan lib/community-access.js: helper ini dipertahankan
// sebagai satu titik keputusan supaya kalau nanti perlu dibatasi lagi (mis.
// per-role), cukup diubah di sini, tidak tersebar di server.js maupun frontend.

export function isBaniEnabledForAgent(agentOrSlug) {
  const slug = typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug;
  return Boolean(String(slug || '').trim());
}

export function requireBaniAccess(agent, res) {
  if (isBaniEnabledForAgent(agent)) return true;
  res.status(403).json({ error: 'Fitur Bani belum tersedia untuk agent ini' });
  return false;
}
