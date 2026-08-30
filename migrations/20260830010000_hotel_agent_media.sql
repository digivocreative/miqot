-- Galeri foto/video hotel VERSI AGENT SENDIRI (permintaan user 2026-08-30).
-- Direktori hotel resmi (hotels.media) tetap kurasi tunggal admin (lihat
-- migrations/20260816000000_hotel_directory.sql); fitur ini menambah galeri
-- TERPISAH per (hotel, agent) supaya agent lain bisa menambahkan foto/video
-- versi mereka sendiri (mis. dari kunjungan langsung) tanpa menimpa galeri
-- resmi. Pola atribusi meniru community_posts (agent_id + media jsonb), tapi
-- SATU baris per (hotel, agent) — agent mengedit galerinya sendiri di tempat,
-- bukan menumpuk banyak post seperti feed Teras.
BEGIN;

CREATE OR REPLACE FUNCTION hotel_agent_media_is_valid(media jsonb) RETURNS boolean AS $$
  SELECT jsonb_typeof(media) = 'array'
    -- Minimal 1 item — galeri kosong berarti agent itu belum/tidak lagi
    -- berkontribusi, jadi barisnya dihapus (lihat DELETE di server.js),
    -- bukan disimpan sebagai array kosong.
    AND jsonb_array_length(media) BETWEEN 1 AND 12
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(media) item
      WHERE jsonb_typeof(item) <> 'object'
         OR NOT (item ? 'type') OR NOT (item ? 'url')
         OR item->>'type' NOT IN ('image','video')
         OR jsonb_typeof(item->'url') <> 'string'
         OR btrim(item->>'url') = ''
    );
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS hotel_agent_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  media JSONB NOT NULL CHECK (hotel_agent_media_is_valid(media)),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Satu galeri per agent per hotel — agent meng-upsert di tempat, bukan
  -- menambah baris baru tiap kali menyimpan.
  UNIQUE (hotel_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_agent_media_hotel ON hotel_agent_media (hotel_id, updated_at DESC);

ALTER TABLE hotel_agent_media ENABLE ROW LEVEL SECURITY;

COMMIT;
NOTIFY pgrst, 'reload schema';
