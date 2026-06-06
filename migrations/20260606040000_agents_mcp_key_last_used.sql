-- Stamp kapan terakhir MCP key dipakai oleh asisten AI (di-update throttled
-- dari server.js saat auth /mcp sukses). UI memakai ini untuk membedakan
-- "kunci aktif tapi belum tersambung" vs "benar-benar tersambung".
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_key_last_used_at timestamptz;
