CREATE TABLE IF NOT EXISTS package_value_cache (
  cache_key TEXT PRIMARY KEY,
  jadwal_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT '',
  document_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  content JSONB NOT NULL,
  itinerary_available BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_value_cache_package_tier
  ON package_value_cache(jadwal_id, tier);

ALTER TABLE package_value_cache ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
