-- Checklist persiapan halaman kloter (/26SEP2026, /12SEP2026, ...).
--
-- Sebelumnya checklist menumpang di booking_persiapan milik Portal Jamaah,
-- yang mewajibkan agent_id (NOT NULL + FK agents). Booking kantor/langsung
-- tidak punya agent → PUT ditolak → centang di perangkat A tidak pernah
-- sampai ke perangkat B. Tabel ini berdiri sendiri: satu baris per jamaah
-- per kloter, tanpa agent, jadi menyimpan satu jamaah tidak menimpa yang lain.
--
-- Jalankan di Supabase SQL Editor. Server sudah aman sebelum ini dijalankan:
-- selama tabel belum ada, ia jatuh kembali ke jalur booking_persiapan lama.
-- Setelah dijalankan, salin data lama: node scripts/backfill-kloter-persiapan.mjs --apply

CREATE TABLE IF NOT EXISTS kloter_persiapan (
  trip_slug TEXT NOT NULL,
  jamaah_no INTEGER NOT NULL,
  id_umroh TEXT NOT NULL,
  jamaah_name TEXT NOT NULL,
  phone TEXT,
  wa_confirmed BOOLEAN NOT NULL DEFAULT false,
  nusuk_installed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_slug, jamaah_no)
);

CREATE INDEX IF NOT EXISTS idx_kloter_persiapan_id_umroh ON kloter_persiapan(id_umroh);

-- Hanya service role (server) yang menulis/membaca; tanpa policy = anon ditolak.
ALTER TABLE kloter_persiapan ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
