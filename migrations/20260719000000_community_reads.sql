CREATE TABLE IF NOT EXISTS community_reads (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE community_reads ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
