-- Nama lain hotel sebagaimana ditulis tim Alhijaz di jadwal ("ELIFIM RESOT",
-- "CONNECT HOTEL") — dipakai matchHotelPhoto (src/lib/hotelThumbs.ts) supaya
-- foto direktori tetap terpasang di detail jadwal walau ejaan jadwal berbeda
-- dari nama kanonik. Validasi isi (trim, dedup, batas panjang) ada di
-- normalizeHotelAliasesInput (lib/hotel-directory.js); CHECK di sini menjaga
-- BENTUKnya saja.
--
-- Terapkan: docker exec -i sb-db psql -U postgres -d postgres < migrations/20261009000000_hotel_aliases.sql
BEGIN;

CREATE OR REPLACE FUNCTION hotel_aliases_is_valid(aliases jsonb) RETURNS boolean AS $$
  SELECT jsonb_typeof(aliases) = 'array'
    AND jsonb_array_length(aliases) <= 10
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(aliases) item
      WHERE jsonb_typeof(item) <> 'string'
         OR btrim(item #>> '{}') = ''
    );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS aliases JSONB NOT NULL DEFAULT '[]'::jsonb;

-- DROP dulu agar migrasi bisa dijalankan ulang tanpa galat "already exists".
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_aliases_valid;
ALTER TABLE hotels
  ADD CONSTRAINT hotels_aliases_valid CHECK (hotel_aliases_is_valid(aliases));

COMMIT;

NOTIFY pgrst, 'reload schema';
