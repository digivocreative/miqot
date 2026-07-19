// Teras terbuka untuk semua agent yang sudah login. Dulu fitur ini dibatasi
// allowlist slug (nikita, bagas) saat masa uji coba; sekarang satu-satunya
// syarat adalah punya akun agent — jadi gate-nya tinggal authMiddleware.
// Helper ini sengaja dipertahankan sebagai satu titik keputusan supaya kalau
// nanti perlu dibatasi lagi (mis. per-role), cukup diubah di sini.

export function isCommunityEnabledForAgent(agentOrSlug) {
  const slug = typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug;
  return Boolean(String(slug || '').trim());
}

export function requireCommunityAccess(agent, res) {
  if (isCommunityEnabledForAgent(agent)) return true;
  res.status(403).json({ error: 'Fitur Teras belum tersedia untuk agent ini' });
  return false;
}

// Hak hapus konten Teras (post & komentar): penulisnya sendiri, atau admin
// sebagai moderator — admin boleh menghapus kiriman agent lain. Sisi klien
// memakai kembar helper ini di src/lib/communityAccess.ts.
export function canModerateCommunityContent(agent, row) {
  if (!agent?.id) return false;
  if (row?.agent_id && row.agent_id === agent.id) return true;
  return agent.role === 'admin';
}
