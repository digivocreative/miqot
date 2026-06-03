-- jamaah_document_cache: caches rendered surat-pernyataan / jamaah documents.
-- Columns + (agent_id, jm_id, document_type) conflict key mirror buildJamaahDocumentCacheRow()
-- in lib/jamaah-document-cache.js. Was never present on managed Supabase either; created on the
-- self-host so the doc cache works instead of permanently cache-missing.
CREATE TABLE IF NOT EXISTS public.jamaah_document_cache (
  agent_id      uuid        NOT NULL,
  jm_id         text        NOT NULL,
  document_type text        NOT NULL,
  source_url    text,
  content_type  text        DEFAULT 'text/html; charset=utf-8',
  content_html  text,
  html_sha256   text,
  fetched_at    timestamptz,
  updated_at    timestamptz DEFAULT now(),
  PRIMARY KEY (agent_id, jm_id, document_type)
);

ALTER TABLE public.jamaah_document_cache ENABLE ROW LEVEL SECURITY;
-- App accesses it with the service_role key (rolbypassrls=true); no anon/authenticated policy.
GRANT ALL ON public.jamaah_document_cache TO service_role;

NOTIFY pgrst, 'reload schema';
