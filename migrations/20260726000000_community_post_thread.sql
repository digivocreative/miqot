-- Teras: utas di composer. Segmen lanjutan sebuah utas adalah baris
-- community_posts biasa dengan parent_post_id + root_post_id terisi.
--
-- Aditif dan aman dijalankan SEBELUM kode baru mendarat: kode lama tidak
-- pernah menulis maupun membaca kolom ini.
--
-- CATATAN: berkas ini sengaja identik dengan "BAGIAN A" pada plan
-- 2026-07-20-teras-komentar-kiriman-penuh.md. Kalau salah satu sudah
-- dijalankan, yang lain jadi no-op (semua IF NOT EXISTS).

BEGIN;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS parent_post_id UUID REFERENCES community_posts(id),
  ADD COLUMN IF NOT EXISTS root_post_id   UUID REFERENCES community_posts(id);

-- Segmen/balasan langsung sebuah kiriman, terurut waktu.
CREATE INDEX IF NOT EXISTS idx_community_posts_parent
  ON community_posts (parent_post_id, created_at)
  WHERE parent_post_id IS NOT NULL AND deleted_at IS NULL;

-- Ambil seluruh utas dalam satu query datar.
CREATE INDEX IF NOT EXISTS idx_community_posts_root
  ON community_posts (root_post_id, created_at)
  WHERE root_post_id IS NOT NULL AND deleted_at IS NULL;

-- Feed utama kini selalu menyaring segmen lanjutan; indeks feed lama tidak
-- lagi cocok dengan predikatnya.
CREATE INDEX IF NOT EXISTS idx_community_posts_feed_roots
  ON community_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND parent_post_id IS NULL;

COMMIT;

-- PostgREST menyimpan cache skema; tanpa ini kolom baru dibalas
-- PGRST204 "could not find column ... in schema cache".
NOTIFY pgrst, 'reload schema';
