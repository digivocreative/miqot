-- FAQ per hotel (permintaan user 2026-08-16, page feedback halaman detail hotel):
-- 5 tanya-jawab paling umum di bawah daftar Fasilitas, supaya agent bisa menjawab
-- pertanyaan jamaah tanpa menebak. Disimpan sebagai jsonb array [{q,a}] mengikuti
-- pola facilities/media di tabel yang sama, bukan tabel terpisah.
-- Terapkan manual di Supabase SQL Editor (proyek ini tidak punya exec_sql/psql).
BEGIN;

CREATE OR REPLACE FUNCTION hotel_faq_is_valid(faq jsonb) RETURNS boolean AS $$
  SELECT jsonb_typeof(faq) = 'array'
    AND jsonb_array_length(faq) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(faq) item
      WHERE jsonb_typeof(item) <> 'object'
         OR NOT (item ? 'q') OR NOT (item ? 'a')
         OR jsonb_typeof(item->'q') <> 'string'
         OR jsonb_typeof(item->'a') <> 'string'
         OR btrim(item->>'q') = ''
         OR btrim(item->>'a') = ''
         OR char_length(item->>'q') > 160
         OR char_length(item->>'a') > 600
    );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS faq JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ADD CONSTRAINT tidak punya IF NOT EXISTS — buang dulu agar migrasi idempoten.
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_faq_valid;
ALTER TABLE hotels ADD CONSTRAINT hotels_faq_valid CHECK (hotel_faq_is_valid(faq));

COMMIT;

NOTIFY pgrst, 'reload schema';
