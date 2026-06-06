import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateMcpApiKey,
  parseMcpBearer,
  createRateLimiter,
  classifyPaymentStatus,
  summarizePayments,
  daysUntilNextBirthday,
} from '../mcp-server.js';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

// ── key format & bearer parsing ──────────────────────────────────────────────

test('generateMcpApiKey produces parseable miqot_mcp_ keys', () => {
  const key = generateMcpApiKey();
  assert.match(key, /^miqot_mcp_[a-f0-9]{48}$/);
  assert.equal(parseMcpBearer(`Bearer ${key}`), key);
  // Two keys must never collide trivially.
  assert.notEqual(generateMcpApiKey(), generateMcpApiKey());
});

test('parseMcpBearer rejects everything that is not a well-formed key', () => {
  assert.equal(parseMcpBearer(undefined), null);
  assert.equal(parseMcpBearer(''), null);
  assert.equal(parseMcpBearer('Bearer '), null);
  assert.equal(parseMcpBearer('Bearer some-jwt-token'), null);
  // JWT must NOT work on the MCP endpoint — it is a separate credential.
  assert.equal(parseMcpBearer('Bearer eyJhbGciOiJIUzI1NiJ9.x.y'), null);
  assert.equal(parseMcpBearer('Bearer miqot_mcp_tooshort'), null);
  assert.equal(parseMcpBearer(`miqot_mcp_${'a'.repeat(48)}`), null); // missing Bearer
  // Case noise is normalized, value returned lowercase.
  assert.equal(
    parseMcpBearer(`bearer MIQOT_MCP_${'A'.repeat(48)}`),
    `miqot_mcp_${'a'.repeat(48)}`,
  );
});

// ── rate limiter ──────────────────────────────────────────────────────────────

test('createRateLimiter enforces a sliding window per key', () => {
  let clock = 0;
  const allow = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => clock });

  assert.equal(allow('k1'), true);
  assert.equal(allow('k1'), true);
  assert.equal(allow('k1'), true);
  assert.equal(allow('k1'), false); // 4th hit in window blocked
  assert.equal(allow('k2'), true);  // other keys unaffected

  clock += 61_000; // window slides
  assert.equal(allow('k1'), true);
});

// ── payment classification ───────────────────────────────────────────────────

test('classifyPaymentStatus mirrors the dashboard buckets', () => {
  assert.equal(classifyPaymentStatus({ bayar: 0, sisa: 33900000 }), 'belum_dp');
  assert.equal(classifyPaymentStatus({ bayar: null, sisa: 0 }), 'belum_dp');
  assert.equal(classifyPaymentStatus({ bayar: 5000000, sisa: 28900000 }), 'belum_lunas');
  assert.equal(classifyPaymentStatus({ bayar: 33900000, sisa: 0 }), 'lunas');
  assert.equal(classifyPaymentStatus({ bayar: 47800000, sisa: -13900000 }), 'lebih_bayar');
});

test('summarizePayments aggregates buckets and departure months', () => {
  const summary = summarizePayments([
    { bayar: 0, sisa: 0, tgl_berangkat: '2026-07-04' },
    { bayar: 5000000, sisa: 28900000, tgl_berangkat: '2026-07-04' },
    { bayar: 34900000, sisa: 0, tgl_berangkat: '2026-07-18' },
    { bayar: 36400000, sisa: 10500000, tgl_berangkat: '2026-09-19' },
    { bayar: 36400000, sisa: 10500000, tgl_berangkat: '2026-09-19' },
  ]);

  assert.equal(summary.total_pax, 5);
  assert.equal(summary.belum_dp, 1);
  assert.equal(summary.belum_lunas, 3);
  assert.equal(summary.lunas, 1);
  assert.equal(summary.total_outstanding, 28900000 + 10500000 * 2);
  assert.equal(summary.by_departure_month['2026-07'].pax, 3);
  assert.equal(summary.by_departure_month['2026-09'].outstanding, 21000000);
});

// ── birthdays ─────────────────────────────────────────────────────────────────

test('daysUntilNextBirthday handles wrap-around and bad input', () => {
  assert.equal(daysUntilNextBirthday('1982-06-10', '2026-06-06'), 4);
  assert.equal(daysUntilNextBirthday('1982-06-06', '2026-06-06'), 0);
  // Birthday already passed this year → next year.
  assert.equal(daysUntilNextBirthday('1982-06-01', '2026-06-06'), 360);
  assert.equal(daysUntilNextBirthday(null, '2026-06-06'), null);
  assert.equal(daysUntilNextBirthday('not-a-date', '2026-06-06'), null);
});

// ── source contracts ──────────────────────────────────────────────────────────

test('mcp-server.js is strictly read-only against the database', () => {
  const src = read('mcp-server.js');
  assert.doesNotMatch(src, /\.insert\(/);
  assert.doesNotMatch(src, /\.update\(/);
  assert.doesNotMatch(src, /\.upsert\(/);
  // Supabase delete is argless `.delete()` — `app.delete('/mcp', ...)` (the 405
  // route) is fine and must not trip this.
  assert.doesNotMatch(src, /\.delete\(\)/);
  assert.doesNotMatch(src, /\.rpc\(/);
});

test('every MCP jamaah query is scoped to the authenticated agent', () => {
  const src = read('mcp-server.js');
  const fromCalls = src.match(/\.from\('jamaah'\)/g) || [];
  const scopedCalls = src.match(/\.eq\('agent_id', agent\.id\)/g) || [];
  assert.ok(fromCalls.length >= 4, 'expected the four read tools to query jamaah');
  assert.equal(
    scopedCalls.length, fromCalls.length,
    'every .from(jamaah) must pair with .eq(agent_id, agent.id)',
  );
  // Pagination hard cap.
  assert.match(src, /MAX_LIMIT = 50/);
});

test('server.js wires the MCP endpoint with admin-only key management', () => {
  const server = read('server.js');
  assert.match(server, /initMcpServer\(app,\s*\{\s*supabase\s*\}\)/);
  assert.match(server, /app\.post\('\/api\/admin\/agents\/:slug\/mcp-key',\s*authMiddleware,\s*adminOnly/);
  assert.match(server, /app\.delete\('\/api\/admin\/agents\/:slug\/mcp-key',\s*authMiddleware,\s*adminOnly/);
  // Rotation/revocation must invalidate the bearer cache immediately.
  const invalidations = server.match(/mcpRuntime\.invalidateKeyCache\(\)/g) || [];
  assert.ok(invalidations.length >= 2);
});

test('self-service MCP key endpoints are scoped to the logged-in agent only', () => {
  const server = read('server.js');

  // GET/POST/DELETE /api/mcp-key — plain authMiddleware (every agent manages
  // their OWN key), never adminOnly, and every query keys on req.user.id.
  for (const method of ['get', 'post', 'delete']) {
    assert.match(server, new RegExp(`app\\.${method}\\('\\/api\\/mcp-key',\\s*authMiddleware,`));
  }
  assert.doesNotMatch(server, /app\.(get|post|delete)\('\/api\/mcp-key',\s*authMiddleware,\s*adminOnly/);

  const selfServiceBlock = server.slice(server.indexOf("app.get('/api/mcp-key'"), server.indexOf("// ──────────────────────────────────────────────\n// CAPI"));
  const scoped = selfServiceBlock.match(/\.eq\('id', req\.user\.id\)/g) || [];
  assert.equal(scoped.length, 3, 'each of the 3 self-service handlers must scope to req.user.id');
  // The key itself must never leave via GET — only the generate response.
  assert.doesNotMatch(selfServiceBlock, /hasKey[\s\S]{0,200}key:\s*data/);
});

test('MCP UI is wired into the ai-tools tab', () => {
  const layout = read('src/components/DashboardLayout.tsx');
  assert.match(layout, /import McpIntegrationPage from '\.\/McpIntegrationPage'/);
  assert.match(layout, /if \(sub === 'mcp'\) return <McpIntegrationPage \/>;/);
  assert.match(layout, /'mcp': \{ icon: Bot/);

  const tools = read('src/components/AIToolsPage.tsx');
  assert.match(tools, /id: 'mcp'/);
  assert.match(tools, /route: 'mcp'/);

  const page = read('src/components/McpIntegrationPage.tsx');
  // Key handling contract: fetched key state only ever comes from the
  // generate/rotate response, shown once.
  assert.match(page, /fetch\('\/api\/mcp-key', \{ method: 'POST'/);
  assert.match(page, /fetch\('\/api\/mcp-key', \{ method: 'DELETE'/);
  assert.match(page, /getAuthHeaders\(\)/);
});
