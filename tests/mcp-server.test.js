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
  computeKalkulasi,
  summarizeJadwalRow,
  cleanCalendarPerson,
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

// ── kalkulasi harga (must mirror src/components/KalkulasiPage.tsx summary) ───

const PAKET_UHUD_RAHMAH = {
  jadwal_id: 'JBU1484',
  jadwal_nama: 'REGULER MIX PAKET RAHMAH & UHUD 9HR (KERETA CEPAT)',
  promo: '0',
  paket_harga: {
    UHUD: { Quard: '33900000', Triple: '35900000', Double: '38900000', Single: '0', Infant: '9000000' },
    RAHMAH: { Quard: '46900000', Triple: '48900000', Double: '51900000', Single: '0', Infant: '' },
  },
};

test('computeKalkulasi prices rooms per pax and applies per-pax discount excluding infant', () => {
  const r = computeKalkulasi(PAKET_UHUD_RAHMAH, {
    tier: 'UHUD',
    kamar_quad: 2,
    kamar_triple: 1,
    infant: 1,
    diskon_per_pax: 500000,
  });

  assert.equal(r.tier_dipakai, 'UHUD');
  assert.equal(r.subtotal, 2 * 33900000 + 35900000 + 9000000);
  // 3 pax (rooms) — infant excluded from the per-pax discount
  assert.equal(r.diskon, 3 * 500000);
  assert.equal(r.grand_total, r.subtotal - r.diskon);
  assert.equal(r.total_pax, 4);
});

test('computeKalkulasi anak-tanpa-kasur discount follows tier/package type', () => {
  // RAHMAH tier → 5.5jt off the quad price
  const rahmah = computeKalkulasi(PAKET_UHUD_RAHMAH, { tier: 'rahmah', kamar_quad: 2, anak_tanpa_kasur: 1 });
  assert.equal(rahmah.tier_dipakai, 'RAHMAH'); // case-insensitive tier match
  const rahmahAnak = rahmah.items.find((i) => i.label === 'Anak (tanpa Kasur)');
  assert.equal(rahmahAnak.harga_satuan, 46900000 - 5500000);

  // PROMO package (promo flag) → 3jt
  const promo = computeKalkulasi({ ...PAKET_UHUD_RAHMAH, promo: '1' }, { tier: 'UHUD', kamar_quad: 1, anak_tanpa_kasur: 1 });
  assert.equal(promo.items.find((i) => i.label === 'Anak (tanpa Kasur)').harga_satuan, 33900000 - 3000000);

  // Plain package → 3.5jt
  const normal = computeKalkulasi(PAKET_UHUD_RAHMAH, { tier: 'UHUD', kamar_quad: 1, anak_tanpa_kasur: 1 });
  assert.equal(normal.items.find((i) => i.label === 'Anak (tanpa Kasur)').harga_satuan, 33900000 - 3500000);
});

test('computeKalkulasi falls back to 8.5jt infant price and clamps grand total at 0', () => {
  // RAHMAH tier has empty Infant price → fallback 8.5jt
  const r = computeKalkulasi(PAKET_UHUD_RAHMAH, { tier: 'RAHMAH', infant: 1 });
  assert.equal(r.items[0].harga_satuan, 8500000);

  const clamped = computeKalkulasi(PAKET_UHUD_RAHMAH, { tier: 'UHUD', kamar_quad: 1, diskon_flat: 999999999 });
  assert.equal(clamped.grand_total, 0);
});

test('computeKalkulasi rejects empty selections and rooms the package does not sell', () => {
  // Single price is 0 → a single-room request produces no items
  assert.ok(computeKalkulasi(PAKET_UHUD_RAHMAH, { tier: 'UHUD', kamar_single: 2 }).error);
  assert.ok(computeKalkulasi(PAKET_UHUD_RAHMAH, {}).error);
  assert.ok(computeKalkulasi({ jadwal_nama: 'X', paket_harga: null }, { kamar_quad: 1 }).error);
});

// ── jadwal & calendar helpers ─────────────────────────────────────────────────

test('summarizeJadwalRow derives duration, sold-out flag, and cheapest tier', () => {
  const row = summarizeJadwalRow({
    jadwal_id: 'JBU1484',
    jadwal_nama: 'PLUS TURKEY 15HR (KERETA CEPAT)',
    promo: '1',
    seat_total: '45',
    seat_sisa: '0',
    berangkat_tgl: '2026-07-18',
    pulang_tgl: '2026-07-26', // date math says 9 — the 15HR in the name must win
    paket_harga: PAKET_UHUD_RAHMAH.paket_harga,
  });

  assert.equal(row.durasi_hari, 15);
  assert.equal(row.sold_out, true);
  assert.equal(row.promo, true);
  assert.equal(row.harga_mulai, 33900000);
  assert.equal(row.tier_termurah, 'UHUD');
});

test('cleanCalendarPerson strips the bullet prefix and empty markers', () => {
  assert.equal(cleanCalendarPerson('•  YULITA ACHMAD RAMLI ARIEF'), 'YULITA ACHMAD RAMLI ARIEF');
  assert.equal(cleanCalendarPerson('-'), null);
  assert.equal(cleanCalendarPerson(''), null);
  assert.equal(cleanCalendarPerson(null), null);
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

test('jadwal/kalkulasi/calendar tools are registered against the cache tables', () => {
  const src = read('mcp-server.js');
  for (const tool of ['list_jadwal_paket', 'get_jadwal_paket', 'kalkulasi_harga', 'calendar_events']) {
    assert.match(src, new RegExp(`register\\('${tool}'`), `${tool} must be registered`);
  }
  // Read from the local cache tables, never the upstream Alhijaz API.
  assert.match(src, /\.from\('umroh_schedules'\)/);
  assert.match(src, /\.from\('calendar_events'\)/);
  assert.doesNotMatch(src, /awapiFetch/);
  // Detail rows must pass through serializeScheduleRows so CDN bookkeeping
  // fields are stripped and brosur/itinerary URLs are version-stamped.
  assert.match(src, /serializeScheduleRows\(\[row\]\)/);
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
  assert.match(server, /initMcpServer\(app,\s*\{\s*supabase,\s*onAuthenticated:\s*stampMcpKeyUsage\s*\}\)/);
  assert.match(server, /app\.post\('\/api\/admin\/agents\/:slug\/mcp-key',\s*authMiddleware,\s*adminOnly/);
  assert.match(server, /app\.delete\('\/api\/admin\/agents\/:slug\/mcp-key',\s*authMiddleware,\s*adminOnly/);
  // Every generate/rotate/revoke must reset bearer cache + usage stamp.
  const resets = server.match(/resetMcpKeyState\(/g) || [];
  assert.ok(resets.length >= 5, 'helper definition + 4 endpoint call sites');
  assert.match(server, /function resetMcpKeyState[\s\S]{0,200}mcpRuntime\.invalidateKeyCache\(\)/);
});

test('MCP usage stamp is throttled, never returned as the key, and resets with the key', () => {
  const server = read('server.js');
  // Throttle guard so chatty assistants do not become a write storm.
  assert.match(server, /MCP_USAGE_STAMP_INTERVAL_MS = 10 \* 60 \* 1000/);
  assert.match(server, /mcp_key_last_used_at: new Date\(now\)\.toISOString\(\)/);
  // GET surfaces lastUsedAt so the UI can distinguish "kunci aktif" from
  // "benar-benar tersambung" — but only when a key exists.
  assert.match(server, /lastUsedAt: data\?\.mcp_api_key \? \(data\?\.mcp_key_last_used_at \|\| null\) : null/);
  // New/removed keys must never inherit the old stamp.
  const stampResets = server.match(/mcp_key_last_used_at: null/g) || [];
  assert.equal(stampResets.length, 4, 'all four key-management endpoints reset the stamp');

  // mcp-server.js stays read-only: telemetry goes through the injected hook.
  const mcp = read('mcp-server.js');
  assert.match(mcp, /onAuthenticated\?\.\(agent\)/);
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
