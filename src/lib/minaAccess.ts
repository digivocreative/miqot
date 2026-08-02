// Sisi klien dari lib/mina-access.js — gate rollout Mina.
//
// TODO: Remove gate — pilot Mina dibatasi slug nikita. Saat rollout dibuka,
// samakan dengan isCommunityEnabledForAgent di ./communityAccess ("punya slug =
// boleh"), dan cabut juga gate-nya di lib/mina-access.js. Server tetap yang
// menegakkan aturannya; helper ini hanya menyembunyikan UI-nya.
const MINA_PILOT_SLUGS = new Set(['nikita']);

export function isMinaEnabledForSlug(slug?: string | null): boolean {
  return MINA_PILOT_SLUGS.has(String(slug || '').trim().toLowerCase());
}
