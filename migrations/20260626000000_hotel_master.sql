-- Hotel master: curated, canonical entity for hotels used by Alhijaz packages.
-- One row = one physical hotel. `aliases` holds the normalized raw-name variants
-- seen in umroh_schedules.paket_hotel so a messy API string can be resolved to it.
-- Feature is gated to a single agent (nikita) at the API/route layer.

CREATE TABLE IF NOT EXISTS hotel_master (
  slug              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  city              TEXT NOT NULL,                 -- 'mekkah' | 'madinah'
  stars             INT,
  distance_label    TEXT,                          -- e.g. '±50m'
  walk_minutes      INT,                           -- curated walking time to the mosque
  view_haram        BOOLEAN NOT NULL DEFAULT false,
  elderly_friendly  BOOLEAN NOT NULL DEFAULT false,
  facilities        JSONB   NOT NULL DEFAULT '[]'::jsonb,  -- ['Resto Indonesia', 'Lift']
  description        TEXT,
  aliases           JSONB   NOT NULL DEFAULT '[]'::jsonb,  -- normalized raw-name variants
  is_setaraf_class  BOOLEAN NOT NULL DEFAULT false, -- generic star-class placeholder, not a named hotel
  photo_url         TEXT,
  sort_order        INT     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_master_city ON hotel_master(city);

ALTER TABLE hotel_master ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
