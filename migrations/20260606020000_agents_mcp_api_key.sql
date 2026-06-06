-- Per-agent API key for the read-only MCP endpoint (/mcp) used by external AI
-- assistants (hermes). Generated/revoked via admin endpoints; key format
-- miqot_mcp_<48 hex>. Unique partial index doubles as the auth lookup index.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_api_key text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_api_key_created_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS agents_mcp_api_key_key
  ON agents (mcp_api_key) WHERE mcp_api_key IS NOT NULL;
