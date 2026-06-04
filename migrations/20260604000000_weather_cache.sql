CREATE TABLE IF NOT EXISTS weather_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
