-- Direktori Hotel v2 (spec docs/superpowers/specs/2026-08-16-direktori-hotel-v2-design.md).
-- Satu tabel hotels dengan media jsonb (pola media Teras); cover = foto pertama di array.
-- Terapkan manual di Supabase SQL Editor (proyek ini tidak punya exec_sql/psql).
BEGIN;

CREATE OR REPLACE FUNCTION hotel_media_is_valid(media jsonb) RETURNS boolean AS $$
  SELECT jsonb_typeof(media) = 'array'
    AND jsonb_array_length(media) <= 30
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(media) item
      WHERE jsonb_typeof(item) <> 'object'
         OR NOT (item ? 'type') OR NOT (item ? 'url')
         OR item->>'type' NOT IN ('image','video')
         OR jsonb_typeof(item->'url') <> 'string'
         OR btrim(item->>'url') = ''
    );
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  city TEXT NOT NULL CHECK (city IN ('mekkah','madinah','turki','dubai')),
  stars SMALLINT CHECK (stars BETWEEN 1 AND 5),
  distance_label TEXT,
  walk_label TEXT,
  area TEXT,
  address TEXT,
  gmaps_url TEXT,
  description TEXT,
  facilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  agent_note TEXT,
  media JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (hotel_media_is_valid(media)),
  created_by UUID REFERENCES agents(id),
  updated_by UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels (city, name);

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

COMMIT;
NOTIFY pgrst, 'reload schema';
