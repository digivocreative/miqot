// Audit harness MCP — menguji initMcpServer SUNGGUHAN end-to-end via HTTP
// dengan data Supabase asli, tapi lookup key di tabel `agents` di-stub supaya
// tidak perlu merotasi key MCP produksi milik agent. READ-ONLY (tools-nya
// read-only by design); butuh SUPABASE_SERVICE_ROLE_KEY di .env, jalankan dari
// root repo. Dipakai audit menyeluruh 2026-06-06 (142 checks vs ground-truth SQL).
// Usage:
//   node scripts/mcp-audit-harness.mjs <agent_slug> <tool_name> '<json-args>'
//   node scripts/mcp-audit-harness.mjs nikita list_jamaah '{"departure_from":"2026-06-13","departure_to":"2026-06-13"}'
//   node scripts/mcp-audit-harness.mjs nikita --list-tools
import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { initMcpServer, generateMcpApiKey } from '../mcp-server.js';

const [slug, toolName, argsJson] = process.argv.slice(2);
if (!slug || !toolName) {
  console.error('usage: node scripts/mcp-audit-harness.mjs <agent_slug> <tool|--list-tools> [json-args]');
  process.exit(2);
}

const real = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Resolve the agent by slug directly (admin-side lookup, same DB).
const { data: agentRow, error: agentErr } = await real
  .from('agents').select('id, slug, name, status').eq('slug', slug).maybeSingle();
if (agentErr || !agentRow) {
  console.error('agent lookup failed:', agentErr?.message || 'not found');
  process.exit(1);
}

// Proxy supabase client: intercept ONLY the auth lookup on `agents` so any
// bearer key resolves to this agent; every other table hits the real DB.
const supabase = new Proxy(real, {
  get(target, prop) {
    if (prop === 'from') {
      return (table) => {
        if (table === 'agents') {
          const stub = {
            select: () => stub,
            eq: () => stub,
            maybeSingle: async () => ({ data: agentRow, error: null }),
          };
          return stub;
        }
        return target.from(table);
      };
    }
    return Reflect.get(target, prop);
  },
});

const app = express();
app.use(express.json({ limit: '2mb' }));
initMcpServer(app, { supabase, log: () => {} });

const httpServer = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const url = `http://127.0.0.1:${httpServer.address().port}/mcp`;

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${generateMcpApiKey()}` } },
});
const client = new Client({ name: 'audit-harness', version: '1.0.0' });
await client.connect(transport);

try {
  if (toolName === '--list-tools') {
    const { tools } = await client.listTools();
    console.log(JSON.stringify(tools.map(t => ({ name: t.name, description: t.description, input: t.inputSchema })), null, 1));
  } else {
    const args = argsJson ? JSON.parse(argsJson) : {};
    const result = await client.callTool({ name: toolName, arguments: args });
    for (const c of result.content || []) {
      if (c.type === 'text') console.log(c.text);
    }
    if (result.isError) process.exitCode = 1;
  }
} finally {
  await client.close().catch(() => {});
  httpServer.close();
}
