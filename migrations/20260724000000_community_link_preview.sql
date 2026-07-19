-- Teras link preview snapshot (judul/gambar/deskripsi/domain) untuk kiriman.
-- Terapkan manual di Supabase SQL Editor (proyek ini tidak punya exec_sql/psql).
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS link_preview jsonb;
