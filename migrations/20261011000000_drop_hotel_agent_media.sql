-- Fitur "Foto dari Agent" di Detail Hotel dihapus (permintaan user 2026-10-11).
-- Tabel sudah kosong saat dihapus (0 baris) — tidak ada data yang ikut hilang.
-- Terapkan SETELAH kode tanpa rute /api/hotels/:slug/agent-media ter-deploy.
-- Tabel milik supabase_admin → jalankan dengan -U supabase_admin.
BEGIN;

DROP TABLE IF EXISTS hotel_agent_media;
DROP FUNCTION IF EXISTS hotel_agent_media_is_valid(jsonb);

COMMIT;
NOTIFY pgrst, 'reload schema';
