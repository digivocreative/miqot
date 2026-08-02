// Gate rollout Bani (asisten AI in-app untuk agent di dashboard).
//
// Pola sengaja mencerminkan lib/community-access.js: satu titik keputusan
// supaya membuka/menutup pilot cukup diubah di file ini, tidak tersebar di
// server.js maupun frontend.
//
// TODO: Remove gate — pilot Bani dibatasi slug nikita. Saat rollout dibuka,
// ubah isBaniEnabledForAgent menjadi "punya slug = boleh" seperti Teras
// (lihat lib/community-access.js), JANGAN menambah allowlist panjang di sini.
const BANI_PILOT_SLUGS = new Set(['nikita']);

export function isBaniEnabledForAgent(agentOrSlug) {
  const slug = typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug;
  return BANI_PILOT_SLUGS.has(String(slug || '').trim().toLowerCase());
}

export function requireBaniAccess(agent, res) {
  if (isBaniEnabledForAgent(agent)) return true;
  res.status(403).json({ error: 'Fitur Bani belum tersedia untuk agent ini' });
  return false;
}
