-- Batasi akses publik (anon) ke tabel agents + aktifkan RLS snapshot backfill.
--
-- Latar: VITE_SUPABASE_ANON_KEY ter-bundle di dist/assets/*.js, jadi bersifat
-- PUBLIK. Setiap GRANT ke role anon = terbuka ke internet. Sebelum migrasi ini
-- tabel agents punya policy "Allow public read" USING (true) + GRANT SELECT
-- level-tabel, sehingga 69 baris berikut ikut terbaca siapa pun:
--   awapi_key (plaintext, kredensial hidup ke API legacy), password & pin_hash
--   (bcrypt), jamaah_username, jamaah_password, mcp_api_key, email, phone,
--   telegram_chat_id.
--
-- Kolom yang dipertahankan diambil dari query NYATA di bundle produksi:
--   from("agents").select("slug, name, website, phone, photo")
--   from("agents").select("slug, name, website, phone, photo, card_variant")
-- (yang kedua berasal dari chunk lama yang masih tersisa di dist/ dan masih bisa
-- dipanggil browser dengan cache lama — jangan dihapus dari daftar tanpa
-- memastikan chunk itu sudah tak terjangkau), plus "status" yang dipakai filter
-- .or('status.eq.active,status.is.null').
--
-- 'authenticated' ikut dibatasi: GoTrue tidak berjalan sehingga role itu tak
-- terjangkau saat ini, tapi policy "Allow public read" berlaku untuk SEMUA role
-- ({public}), jadi lubangnya terbuka lagi begitu auth diaktifkan.
--
-- Tulis (INSERT/UPDATE/DELETE) sudah tertutup oleh policy "Service role only"
-- dan tidak diubah di sini.
--
-- service_role punya BYPASSRLS, jadi seluruh akses server-side (server.js pakai
-- SUPABASE_SERVICE_ROLE_KEY) tidak terpengaruh.

BEGIN;

REVOKE SELECT ON public.agents FROM anon, authenticated;

GRANT SELECT (slug, name, website, phone, photo, card_variant, status)
  ON public.agents TO anon, authenticated;

-- 489 baris PII jamaah + nominal bayar, sebelumnya tanpa RLS sama sekali.
ALTER TABLE public.jamaah_payment_backfill_snapshot ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
