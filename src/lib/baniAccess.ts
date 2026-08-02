// Sisi klien dari lib/bani-access.js — gate rollout Bani.
//
// TODO: Remove gate — pilot Bani dibatasi slug nikita. Saat rollout dibuka,
// samakan dengan isCommunityEnabledForAgent di ./communityAccess ("punya slug =
// boleh"), dan cabut juga gate-nya di lib/bani-access.js. Server tetap yang
// menegakkan aturannya; helper ini hanya menyembunyikan UI-nya.
const BANI_PILOT_SLUGS = new Set(['nikita']);

export function isBaniEnabledForSlug(slug?: string | null): boolean {
  return BANI_PILOT_SLUGS.has(String(slug || '').trim().toLowerCase());
}
