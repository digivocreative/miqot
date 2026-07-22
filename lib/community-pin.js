// Kelayakan pin kiriman Teras — murni, tanpa DB, diuji unit.
// Kebijakan (spec 2026-07-22): hanya kiriman induk yang hidup. Utas dipin
// lewat segmen pertamanya; balasan & segmen lanjutan ditolak. Nilai
// undefined pada kolom utas (pra-migrasi is_reply/parent_post_id) lolos —
// konsisten dengan degradasi fitur utas di server.

export function canPinCommunityPost(post) {
  if (post?.deleted_at) return { ok: false, error: 'Kiriman tidak ditemukan' };
  if (post?.is_reply === true) return { ok: false, error: 'Balasan tidak bisa disematkan' };
  if (post?.parent_post_id !== null && post?.parent_post_id !== undefined) {
    return { ok: false, error: 'Hanya segmen pertama utas yang bisa disematkan' };
  }
  return { ok: true };
}
