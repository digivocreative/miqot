-- Watermark notifikasi Telegram per-jamaah (jalankan manual di Supabase SQL Editor).
--
-- Masalah: deteksi notif "jamaah baru" / "pembayaran masuk" membandingkan data
-- sync dengan isi DB, tapi upsert selalu menulis lebih dulu. Setiap kali notif
-- di-drop (siklus partial, di luar jam kirim 08-21, restart, gagal kirim,
-- pax bayar=0), delta-nya terlanjur terserap DB dan event hilang permanen —
-- akar keluhan "grup daftar ber-5 tapi notif cuma sebagian" (AIW0030233,
-- 2026-08-16).
--
-- Solusi: dua kolom watermark yang HANYA maju setelah notifikasi benar-benar
-- terkirim (atau sengaja di-skip oleh preferensi agent):
--   notif_new_sent_at  — kapan pax ini pernah diumumkan sebagai jamaah baru
--   notif_last_bayar   — nilai bayar terakhir yang sudah dinotifikasikan
--
-- Tanpa migrasi ini server tetap jalan (deteksi mode lama + log peringatan).
-- Setelah menjalankan SQL ini, restart server (pm2 restart server) agar probe
-- kolom mengaktifkan mode watermark.

ALTER TABLE public.jamaah
  ADD COLUMN IF NOT EXISTS notif_new_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notif_last_bayar numeric;

-- Backfill: seluruh row existing dianggap SUDAH pernah diumumkan dengan bayar
-- saat ini — supaya deploy tidak membanjiri agent dengan ribuan notif "baru".
UPDATE public.jamaah
SET notif_new_sent_at = COALESCE(notif_new_sent_at, now()),
    notif_last_bayar  = COALESCE(notif_last_bayar, bayar, 0)
WHERE notif_new_sent_at IS NULL
   OR notif_last_bayar IS NULL;
