-- Sambungan OAuth asisten AI (Claude, ChatGPT, ...) ke MCP /mcp per agent.
--
-- Satu baris = satu aplikasi AI yang pernah diizinkan agent lewat halaman login
-- /oauth/mcp/authorize. Token OAuth sendiri stateless (JWT bertanda tangan,
-- mcp-oauth.js); baris ini yang membuatnya bisa DICABUT: access/refresh token
-- membawa id baris (gid) dan ditolak begitu revoked_at terisi atau agent
-- non-aktif. last_used_at = status "terakhir aktif" di /dashboard/ai-tools/mcp.
--
-- Terapkan: docker exec -i sb-db psql -U postgres -d postgres < migrations/20261009010000_mcp_oauth_grants.sql
BEGIN;

CREATE TABLE IF NOT EXISTS mcp_oauth_grants (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  redirect_host TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  -- Rotasi refresh token sekali pakai: hanya jti refresh_jti yang sah; jti
  -- sebelumnya (prev_refresh_jti) dalam 30 dtk sesudah refreshed_at = balapan
  -- klien, selain itu = pemakaian ulang → grant dicabut.
  refresh_jti TEXT,
  prev_refresh_jti TEXT,
  refreshed_at TIMESTAMPTZ
);

-- Untuk DB yang sudah menerapkan versi awal migrasi ini (tanpa kolom rotasi).
ALTER TABLE mcp_oauth_grants ADD COLUMN IF NOT EXISTS refresh_jti TEXT;
ALTER TABLE mcp_oauth_grants ADD COLUMN IF NOT EXISTS prev_refresh_jti TEXT;
ALTER TABLE mcp_oauth_grants ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_grants_agent_active
  ON mcp_oauth_grants(agent_id) WHERE revoked_at IS NULL;

-- Hanya service role (server) yang membaca/menulis. Anon key Supabase publik
-- (ter-bundle di dist/), jadi tanpa policy + REVOKE eksplisit.
ALTER TABLE mcp_oauth_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mcp_oauth_grants FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
