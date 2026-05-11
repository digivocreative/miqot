-- Cleanup script untuk akun demo "bagas".
-- Jalankan via Supabase SQL editor atau psql.
-- Setelah cleanup, hapus 'bagas' dari DEMO_AGENT_SLUGS di server.js.
--
-- Demo data signature: id_umroh LIKE 'DEMO_UM_%' / id_haji LIKE 'DEMO_HJ_%'.
-- Aman dijalankan berkali-kali (idempotent).

BEGIN;

-- 1) Hapus dummy jamaah umroh (20 baris, prefix DEMO_UM_*).
DELETE FROM jamaah
WHERE agent_id = (SELECT id FROM agents WHERE slug = 'bagas')
  AND id_umroh LIKE 'DEMO_UM_%';

-- 2) Hapus dummy jamaah haji (20 baris, prefix DEMO_HJ_*).
DELETE FROM jamaah_haji
WHERE agent_id = (SELECT id FROM agents WHERE slug = 'bagas')
  AND id_haji LIKE 'DEMO_HJ_%';

-- 3) Reset kredensial demo + bio_config + sync timestamp.
--    Akun bagas tetap ada di tabel agents (slug, name, email tidak diubah).
UPDATE agents SET
  jamaah_username = NULL,
  jamaah_password = NULL,
  jamaah_kantor = '2',
  last_jamaah_sync_at = NULL,
  last_jamaah_haji_sync_at = NULL,
  bio_config = '{}'::jsonb
WHERE slug = 'bagas';

-- 4) Verifikasi: harus 0 row dummy tersisa.
SELECT 'jamaah_demo_remaining' AS check, COUNT(*) AS n
FROM jamaah
WHERE agent_id = (SELECT id FROM agents WHERE slug = 'bagas') AND id_umroh LIKE 'DEMO_%'
UNION ALL
SELECT 'jamaah_haji_demo_remaining', COUNT(*)
FROM jamaah_haji
WHERE agent_id = (SELECT id FROM agents WHERE slug = 'bagas') AND id_haji LIKE 'DEMO_%';

COMMIT;

-- Setelah COMMIT, ubah server.js:
--   const DEMO_AGENT_SLUGS = new Set([]);   // kosongkan
-- atau hapus konstanta + 8 cek isDemoAgent() sepenuhnya.
-- Lalu restart server.
