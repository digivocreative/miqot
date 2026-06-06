-- Per-agent API key for the read-only MCP endpoint (/mcp) used by external AI
-- assistants (hermes). Generated/revoked via admin endpoints; key format
-- Stores the sha256 HEX HASH of the bearer key (since 2026-06-06 hardening) —
-- plaintext key is shown to the agent only once at generate time. Key format
-- alhijaz_mcp_<48 hex> (legacy miqot_mcp_ still accepted). Unique partial index
-- doubles as the auth lookup index (lookup is by hash). Legacy plaintext rows
-- migrated in place by scripts/backfill-mcp-key-hash.mjs.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_api_key text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_api_key_created_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS agents_mcp_api_key_key
  ON agents (mcp_api_key) WHERE mcp_api_key IS NOT NULL;
