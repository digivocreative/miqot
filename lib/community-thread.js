/**
 * Bentuk thread Teras. Dipakai server.js untuk menyusun respons komentar dan
 * halaman detail; sengaja murni (tanpa Supabase) supaya bisa diuji langsung.
 *
 * Balasan adalah baris community_posts dengan parent_post_id terisi.
 * root_post_id didenormalisasi saat insert agar satu thread terambil dalam
 * satu query datar, tanpa CTE rekursif.
 */

/** Akar thread untuk balasan atas `parent`. Kiriman induk jadi akarnya sendiri. */
export function resolveRootPostId(parent) {
  if (!parent?.id) throw new Error('resolveRootPostId: induk tanpa id');
  return parent.root_post_id || parent.id;
}

/**
 * Rantai leluhur `postId`, urut dari akar ke induk terdekat, tanpa memuat
 * `postId` sendiri. Leluhur yang terhapus atau barisnya tidak ada dikirim
 * sebagai `{ available: false }` — bukan dibuang dan bukan 404 — supaya
 * menghapus satu kiriman tidak mematikan thread di bawahnya.
 */
export function buildAncestorChain(rows, postId) {
  const byId = new Map((rows || []).filter(row => row?.id).map(row => [row.id, row]));
  const chain = [];
  const seen = new Set([postId]);

  let cursor = byId.get(postId)?.parent_post_id || null;
  while (cursor) {
    if (seen.has(cursor)) break; // cincin mustahil, tapi jangan menggantung
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row || row.deleted_at) {
      chain.push({ available: false });
      cursor = row?.parent_post_id || null;
      continue;
    }
    chain.push({
      available: true,
      id: row.id,
      body: row.body,
      created_at: row.created_at,
      author: row.author || null,
    });
    cursor = row.parent_post_id || null;
  }

  return chain.reverse();
}

/**
 * Untuk tiap komentar di `children`, hitung jumlah balasannya dan ambil
 * `previewLimit` balasan TERLAMA (urut lama→baru, sesuai urutan tampil).
 * Cuplikan sengaja balasan PERTAMA supaya "Lihat N balasan lainnya" menambah
 * sisanya DI BAWAH cuplikan (tak ada balasan yang tergeser ke atas saat
 * di-expand). Balasan terhapus tidak dihitung dan tidak ditampilkan.
 */
export function groupRepliesWithPreview(children, grandchildren, options = {}) {
  const previewLimit = Number.isInteger(options.previewLimit) ? options.previewLimit : 2;
  const grouped = new Map();
  for (const child of children || []) {
    if (child?.id) grouped.set(child.id, { reply_count: 0, preview_replies: [] });
  }

  const buckets = new Map();
  for (const row of grandchildren || []) {
    if (!row?.id || row.deleted_at) continue;
    const parentId = row.parent_post_id;
    if (!grouped.has(parentId)) continue;
    if (!buckets.has(parentId)) buckets.set(parentId, []);
    buckets.get(parentId).push(row);
  }

  for (const [parentId, rows] of buckets) {
    // Saat created_at seri (backfill migrasi bisa menyalin created_at apa
    // adanya, atau dua balasan lahir pada milidetik yang sama), tiebreak
    // jatuh ke urutan string id. id adalah UUID acak (gen_random_uuid), jadi
    // urutan ini TIDAK mencerminkan mana yang lebih baru — dipilih semata
    // demi determinisme (stabilitas tampilan & tes), bukan akurasi waktu.
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))
      || String(a.id).localeCompare(String(b.id)));
    grouped.set(parentId, {
      reply_count: rows.length,
      preview_replies: previewLimit > 0 ? rows.slice(0, previewLimit) : [],
    });
  }

  return grouped;
}
