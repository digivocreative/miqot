-- Banner kartu kategori Direktori Hotel (permintaan user 2026-08-16):
-- admin bisa mengganti gambar kartu Mekkah/Madinah/Turki/Dubai dari panel Hotels.
-- Tanpa baris = kartu jatuh ke cover hotel pertama kota itu (perilaku lama).
-- Terapkan manual di Supabase SQL Editor (proyek ini tidak punya exec_sql/psql).
BEGIN;

CREATE TABLE IF NOT EXISTS hotel_city_banners (
  city TEXT PRIMARY KEY CHECK (city IN ('mekkah','madinah','turki','dubai')),
  image_url TEXT NOT NULL CHECK (char_length(image_url) BETWEEN 1 AND 500),
  updated_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hotel_city_banners ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
