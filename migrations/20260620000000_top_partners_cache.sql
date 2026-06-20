CREATE TABLE IF NOT EXISTS top_partners_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE top_partners_cache ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
