-- Rating platform pemesanan per hotel (Google, Tripadvisor, Booking, Agoda,
-- Trip.com). Disimpan sebagai daftar, bukan kolom per platform, supaya
-- menambah platform berikutnya tidak perlu migrasi lagi.
--
-- Skala BERBEDA per platform (Booking & Agoda /10, sisanya /5) — batas atas
-- tidak bisa dijaga di CHECK ini tanpa mengeraskan daftar platform ke dalam
-- skema; validasinya ada di normalizeHotelRatingsInput (lib/hotel-directory.js)
-- yang dilewati semua tulisan. CHECK di sini menjaga BENTUKnya saja.
--
-- Terapkan manual di Supabase SQL Editor (proyek ini tidak punya exec_sql/psql).
BEGIN;

CREATE OR REPLACE FUNCTION hotel_ratings_is_valid(ratings jsonb) RETURNS boolean AS $$
  SELECT jsonb_typeof(ratings) = 'array'
    AND jsonb_array_length(ratings) <= 10
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(ratings) item
      WHERE jsonb_typeof(item) <> 'object'
         OR NOT (item ? 'platform') OR NOT (item ? 'score')
         OR jsonb_typeof(item->'platform') <> 'string'
         OR btrim(item->>'platform') = ''
         OR jsonb_typeof(item->'score') <> 'number'
         OR (item->>'score')::numeric < 0
         OR (item->>'score')::numeric > 10
    );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS ratings JSONB NOT NULL DEFAULT '[]'::jsonb;

-- DROP dulu agar migrasi bisa dijalankan ulang tanpa galat "already exists".
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_ratings_valid;
ALTER TABLE hotels
  ADD CONSTRAINT hotels_ratings_valid CHECK (hotel_ratings_is_valid(ratings));

COMMIT;

NOTIFY pgrst, 'reload schema';
