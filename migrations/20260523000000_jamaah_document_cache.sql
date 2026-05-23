CREATE TABLE IF NOT EXISTS jamaah_document_cache (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  jm_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  source_url TEXT,
  content_type TEXT NOT NULL DEFAULT 'text/html; charset=utf-8',
  content_html TEXT NOT NULL,
  html_sha256 TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, jm_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_jamaah_document_cache_agent_jm
  ON jamaah_document_cache(agent_id, jm_id);

ALTER TABLE jamaah_document_cache ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
