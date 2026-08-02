// Gate rollout Mina (asisten AI in-app untuk agent di dashboard).
//
// Pola sengaja mencerminkan lib/community-access.js: satu titik keputusan
// supaya membuka/menutup pilot cukup diubah di file ini, tidak tersebar di
// server.js maupun frontend.
//
// TODO: Remove gate — pilot Mina dibatasi slug nikita. Saat rollout dibuka,
// ubah isMinaEnabledForAgent menjadi "punya slug = boleh" seperti Teras
// (lihat lib/community-access.js), JANGAN menambah allowlist panjang di sini.
const MINA_PILOT_SLUGS = new Set(['nikita']);

export function isMinaEnabledForAgent(agentOrSlug) {
  const slug = typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug;
  return MINA_PILOT_SLUGS.has(String(slug || '').trim().toLowerCase());
}

export function requireMinaAccess(agent, res) {
  if (isMinaEnabledForAgent(agent)) return true;
  res.status(403).json({ error: 'Fitur Mina belum tersedia untuk agent ini' });
  return false;
}
