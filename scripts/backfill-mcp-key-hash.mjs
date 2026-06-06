// One-off: migrate plaintext MCP keys in agents.mcp_api_key to sha256 hashes
// in place, so the new hash-based lookup (mcp-server.js resolveAgent) keeps
// matching keys already installed in agents' assistants. Idempotent: rows that
// already hold a 64-hex hash are skipped.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { hashMcpApiKey } from '../mcp-server.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from('agents')
  .select('id, slug, mcp_api_key')
  .not('mcp_api_key', 'is', null);
if (error) { console.error('lookup failed:', error.message); process.exit(1); }

const RAW = /^(?:alhijaz|miqot)_mcp_[0-9a-f]{48}$/i;
const HASH = /^[0-9a-f]{64}$/;
let migrated = 0, skipped = 0;

for (const a of data || []) {
  const key = String(a.mcp_api_key);
  if (HASH.test(key)) { skipped++; continue; }
  if (!RAW.test(key)) { console.warn(`SKIP ${a.slug}: unrecognized key shape`); skipped++; continue; }
  const hash = hashMcpApiKey(key);
  const { error: upErr } = await sb.from('agents').update({ mcp_api_key: hash }).eq('id', a.id);
  if (upErr) { console.error(`FAIL ${a.slug}:`, upErr.message); continue; }
  console.log(`migrated ${a.slug}: ${key.slice(0, 14)}… → ${hash.slice(0, 12)}…`);
  migrated++;
}
console.log(`\nDone. migrated=${migrated} skipped=${skipped}`);
process.exit(0);
