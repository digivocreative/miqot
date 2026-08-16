// MCP server (Model Context Protocol) — read-only data access for per-agent AI
// assistants (hermes/openclaw-style agents running on their own machines).
//
// Design (2026-06-06):
// - Streamable HTTP transport in STATELESS mode (new server+transport per
//   request, sessionIdGenerator: undefined) mounted at POST /mcp on the main
//   Express app — no extra port/service, survives miqot.service restarts.
// - Auth: `Authorization: Bearer alhijaz_mcp_<48 hex>` — per-agent key stored in
//   agents.mcp_api_key (generated/revoked by admin endpoints in server.js).
//   Terminologi user-facing selalu "alhijaz", JANGAN "miqot" (keputusan user
//   2026-06-06); prefix lama `miqot_mcp_` masih diterima demi key yang
//   terlanjur terpasang di asisten agent.
//   Every tool is hard-scoped to the authenticated agent's agent_id, the same
//   isolation contract as the REST API.
// - READ-ONLY by design: this module must never call .insert/.update/.delete/
//   .upsert/.rpc — enforced by tests/mcp-server.test.js source greps.
// - Rate limit 30 req/min per key: agentic clients are chatty and the DB is
//   shared with the dashboard + sync (see db-io-throttling history).
import crypto from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
// Isi ke-8 tool (deskripsi + body handler + helper murninya) tinggal di
// lib/bani-tools.js — dulu dipakai bersama asisten in-app Bani, yang kini sudah
// dihapus. Di sini yang tersisa hanya lapisan MCP: auth, rate limit, skema zod,
// dan envelope content.
import { BANI_TOOL_BY_NAME, MAX_LIMIT } from './lib/bani-tools.js';

// Re-export helper murni yang dulu didefinisikan di file ini — importer lama
// (tests/mcp-server.test.js, scripts) tidak boleh putus karena kodenya pindah.
export {
  MAX_LIMIT,
  classifyPaymentStatus,
  summarizePayments,
  computeKalkulasi,
  summarizeJadwalRow,
  cleanCalendarPerson,
  cleanCalendarPaket,
  daysUntilNextBirthday,
  isRealISODate,
  isRealMonth,
  maskPassport,
} from './lib/bani-tools.js';

const KEY_PREFIX = 'alhijaz_mcp_';
const KEY_HEX_LEN = 48; // 24 random bytes
const RATE_LIMIT_PER_MINUTE = 30;
const IP_RATE_LIMIT_PER_MINUTE = 100; // per-source-IP ceiling (above per-key)
const KEY_CACHE_TTL_MS = 60_000;

export function generateMcpApiKey() {
  return KEY_PREFIX + crypto.randomBytes(KEY_HEX_LEN / 2).toString('hex');
}

// Keys are stored HASHED at rest (sha256 hex of the lowercased bearer token):
// a DB/backup leak then exposes only hashes, not usable bearer tokens. The
// plaintext key is shown to the agent exactly once at generate time. Lookup
// hashes the incoming token and matches the stored hash. Legacy plaintext keys
// are migrated in place by scripts/backfill-mcp-key-hash.mjs (same function).
export function hashMcpApiKey(token) {
  return crypto.createHash('sha256').update(String(token).toLowerCase()).digest('hex');
}

export function parseMcpBearer(header) {
  if (typeof header !== 'string') return null;
  // `miqot_mcp_` = prefix legacy (pra-rename 2026-06-06), tetap diterima agar
  // key yang sudah terpasang di asisten agent tidak putus.
  const m = header.match(/^Bearer\s+((?:alhijaz|miqot)_mcp_[a-f0-9]{48})\s*$/i);
  return m ? m[1].toLowerCase() : null;
}

// Sliding-window limiter, in-memory (single-process app). Injectable clock for
// tests.
export function createRateLimiter({ limit = RATE_LIMIT_PER_MINUTE, windowMs = 60_000, now = Date.now } = {}) {
  const hits = new Map();
  return function allow(key) {
    const t = now();
    let arr = hits.get(key);
    if (!arr) { arr = []; hits.set(key, arr); }
    while (arr.length && t - arr[0] >= windowMs) arr.shift();
    if (arr.length >= limit) return false;
    arr.push(t);
    if (hits.size > 5000) hits.clear(); // unbounded-growth backstop (garbage keys)
    return true;
  };
}

// Asisten AI (terutama model kecil) sering mengirim 30 (number) untuk enum
// string '30', atau '2' (string) untuk page numerik — koersi dulu sebelum
// validasi supaya panggilan tidak terbuang sia-sia karena -32602. JSON schema
// yang diiklankan ke klien tetap tipe aslinya.
const zDayEnum = (values) => z.preprocess((v) => (v == null ? v : String(v)), z.enum(values));
const zInt = (schema) => z.preprocess((v) => (v == null || v === '' ? undefined : Number(v)), schema);

function toolResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 1) }] };
}

function toolError(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

const TOOL = BANI_TOOL_BY_NAME;

function buildAgentMcpServer({ agent, supabase, log }) {
  const server = new McpServer({ name: 'alhijaz', version: '1.0.0' });
  const deps = { supabase, agent, log };

  const register = (name, config, handler) => {
    server.registerTool(name, config, async (args = {}) => {
      // Log only WHICH params were used, never their values — search/jm_id can
      // carry jamaah names/phones (PII) into journald.
      log(`[MCP] ${agent.slug}: ${name} (${Object.keys(args || {}).join(',') || 'no args'})`);
      try {
        // Handler lib/bani-tools.js mengembalikan bentuk netral
        // { ok, data|error }; pembungkusan ke content MCP terjadi di sini saja.
        const out = await handler(args);
        return out?.ok ? toolResult(out.data) : toolError(out?.error || 'Permintaan tidak dapat diproses');
      } catch (err) {
        // Real DB/internal error stays in the server log; the client gets a
        // generic message so Postgres internals never leak downstream.
        log(`[MCP] ${agent.slug}: ${name} ERROR ${err.message}`);
        return toolError('Terjadi kesalahan internal saat memproses permintaan. Coba lagi.');
      }
    });
  };

  // Skema zod TIDAK berubah: validasi yang dilihat klien MCP tetap identik.
  // Title/description diambil dari registry supaya prosa tool punya satu sumber.
  register('list_jamaah', {
    title: TOOL.list_jamaah.title,
    description: TOOL.list_jamaah.description,
    inputSchema: {
      search: z.string().max(80).optional().describe('Cari di nama, id_umroh, atau nomor WA'),
      payment_status: z.enum(['belum_dp', 'belum_lunas', 'lunas', 'lebih_bayar']).optional(),
      departure: zDayEnum(['30', '60', '90', 'all_upcoming', 'departed', 'all']).optional()
        .describe('Window keberangkatan dalam hari ke depan; default all_upcoming (atau all saat search diisi). Untuk tanggal spesifik pakai departure_from/departure_to.'),
      departure_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Keberangkatan mulai tanggal ini (YYYY-MM-DD, inklusif). Untuk SATU tanggal eksak, isi sama dengan departure_to.'),
      departure_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Keberangkatan sampai tanggal ini (YYYY-MM-DD, inklusif)'),
      page: zInt(z.number().int().min(1)).optional(),
      limit: zInt(z.number().int().min(1).max(MAX_LIMIT)).optional(),
    },
  }, (args) => TOOL.list_jamaah.run(deps, args));

  register('get_jamaah', {
    title: TOOL.get_jamaah.title,
    description: TOOL.get_jamaah.description,
    inputSchema: {
      jm_id: z.string().min(3).max(40).describe('ID jamaah, mis. JM999999990000063643'),
    },
  }, (args) => TOOL.get_jamaah.run(deps, args));

  register('jamaah_birthdays', {
    title: TOOL.jamaah_birthdays.title,
    description: TOOL.jamaah_birthdays.description,
    inputSchema: {
      within_days: zDayEnum(['7', '30', '60', '90']).optional().describe('Default 30'),
    },
  }, (args) => TOOL.jamaah_birthdays.run(deps, args));

  register('payment_summary', {
    title: TOOL.payment_summary.title,
    description: TOOL.payment_summary.description,
    inputSchema: {
      group_by: z.preprocess((v) => (v == null ? v : String(v)), z.enum(['month', 'date'])).optional()
        .describe('Granularitas breakdown keberangkatan: month (default) atau date (per-tanggal)'),
      horizon_days: zInt(z.number().int().min(1).max(366)).optional()
        .describe('Batasi ke keberangkatan N hari ke depan, mis. 90 untuk fokus tagihan dekat keberangkatan'),
    },
  }, (args) => TOOL.payment_summary.run(deps, args));

  // ── Data operasional Alhijaz (global — sama untuk semua agent, seperti yang
  // tampil di dashboard & landing page publik) ──

  register('list_jadwal_paket', {
    title: TOOL.list_jadwal_paket.title,
    description: TOOL.list_jadwal_paket.description,
    inputSchema: {
      month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Filter bulan keberangkatan, format YYYY-MM'),
      search: z.string().max(80).optional().describe('Cari di nama paket, mis. "TURKEY" atau "PROMO"'),
      promo_only: z.boolean().optional(),
      available_only: z.boolean().optional().describe('Hanya paket yang masih ada seat'),
      include_departed: z.boolean().optional().describe('Sertakan keberangkatan yang sudah lewat (default tidak)'),
      page: zInt(z.number().int().min(1)).optional(),
      limit: zInt(z.number().int().min(1).max(MAX_LIMIT)).optional(),
    },
  }, (args) => TOOL.list_jadwal_paket.run(deps, args));

  register('get_jadwal_paket', {
    title: TOOL.get_jadwal_paket.title,
    description: TOOL.get_jadwal_paket.description,
    inputSchema: {
      jadwal_id: z.string().min(2).max(30).describe('ID jadwal dari list_jadwal_paket, mis. JBU1484'),
    },
  }, (args) => TOOL.get_jadwal_paket.run(deps, args));

  register('kalkulasi_harga', {
    title: TOOL.kalkulasi_harga.title,
    description: TOOL.kalkulasi_harga.description,
    inputSchema: {
      jadwal_id: z.string().min(2).max(30),
      tier: z.string().max(30).optional().describe('Tier harga, mis. UHUD / RAHMAH — default tier pertama paket'),
      kamar_quad: z.number().int().min(0).max(200).optional().describe('Jumlah orang di kamar quad'),
      kamar_triple: z.number().int().min(0).max(200).optional(),
      kamar_double: z.number().int().min(0).max(200).optional(),
      kamar_single: z.number().int().min(0).max(200).optional(),
      anak_tanpa_kasur: z.number().int().min(0).max(50).optional(),
      infant: z.number().int().min(0).max(50).optional(),
      diskon_per_pax: z.number().min(0).optional().describe('Diskon Rupiah per jamaah (infant tidak dihitung)'),
      diskon_flat: z.number().min(0).optional().describe('Diskon Rupiah total'),
    },
  }, (args) => TOOL.kalkulasi_harga.run(deps, args));

  register('calendar_events', {
    title: TOOL.calendar_events.title,
    description: TOOL.calendar_events.description,
    inputSchema: {
      type: z.enum(['manasik', 'keberangkatan', 'kepulangan']).optional().describe('Default semua tipe'),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Tanggal mulai, default hari ini'),
      days: zInt(z.number().int().min(1).max(120)).optional().describe('Rentang hari ke depan (batas akhir inklusif), default 30'),
      search: z.string().max(80).optional().describe('Cari di nama paket / nama Tour Leader / nomor grup'),
    },
  }, (args) => TOOL.calendar_events.run(deps, args));

  return server;
}

function jsonRpcError(res, status, code, message) {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

export function initMcpServer(app, { supabase, log = console.log, onAuthenticated } = {}) {
  if (!supabase) throw new Error('initMcpServer: supabase client is required');

  const rateLimiter = createRateLimiter();
  // Per-IP ceiling, applied BEFORE token parsing/lookup. The per-token limiter
  // alone is trivially bypassed by spraying distinct tokens (each gets its own
  // bucket), turning unauthenticated requests into uncapped agents-table
  // lookups against an IO-sensitive Postgres. This caps total /mcp traffic per
  // source IP regardless of token. Higher than per-key so a few real agents
  // behind one NAT still fit.
  const ipLimiter = createRateLimiter({ limit: IP_RATE_LIMIT_PER_MINUTE });
  // token-hash -> { agent|null, expiresAt }; negative entries stop bad keys
  // from hammering the DB between rate-limit windows.
  const keyCache = new Map();

  const resolveAgent = async (token) => {
    // Keys are stored hashed; never query by the raw bearer token.
    const keyHash = hashMcpApiKey(token);
    const cached = keyCache.get(keyHash);
    if (cached && cached.expiresAt > Date.now()) return cached.agent;
    const { data, error } = await supabase
      .from('agents')
      .select('id, slug, name, status')
      .eq('mcp_api_key', keyHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const agent = data && data.status === 'active' ? data : null;
    keyCache.set(keyHash, { agent, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
    if (keyCache.size > 1000) keyCache.clear();
    return agent;
  };

  app.post('/mcp', async (req, res) => {
    // Caddy sets X-Real-IP to the true client; fall back to XFF/socket.
    const clientIp = req.headers['x-real-ip']
      || (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : '')
      || req.ip || 'unknown';
    if (!ipLimiter(clientIp)) {
      log(`[MCP] reject 429 per-IP ${clientIp}`);
      return jsonRpcError(res, 429, -32002, `Rate limit: terlalu banyak request dari IP ini (max ${IP_RATE_LIMIT_PER_MINUTE}/menit)`);
    }

    // Log setiap penolakan auth/rate-limit (tanpa token mentah — hanya 8 hex
    // awal hash sebagai korelasi): laporan "asisten AI tidak dapat data" tak
    // bisa didiagnosis kalau jalur 401/429 diam total di journald.
    const token = parseMcpBearer(req.headers.authorization);
    const keyTag = token ? `key#${hashMcpApiKey(token).slice(0, 8)}` : 'no-token';
    if (!token) {
      log(`[MCP] reject 401 missing/malformed bearer ip=${clientIp}`);
      return jsonRpcError(res, 401, -32001, 'Unauthorized: kirim header Authorization: Bearer alhijaz_mcp_...');
    }
    if (!rateLimiter(token)) {
      log(`[MCP] reject 429 per-key ${keyTag} ip=${clientIp}`);
      return jsonRpcError(res, 429, -32002, `Rate limit: max ${RATE_LIMIT_PER_MINUTE} request/menit per key`);
    }

    let agent;
    try {
      agent = await resolveAgent(token);
    } catch (err) {
      log(`[MCP] auth lookup error: ${err.message}`);
      return jsonRpcError(res, 503, -32003, 'Auth lookup failed, coba lagi');
    }
    if (!agent) {
      log(`[MCP] reject 401 unknown/inactive ${keyTag} ip=${clientIp}`);
      return jsonRpcError(res, 401, -32001, 'Unauthorized: API key tidak dikenal atau agent non-aktif');
    }

    // Usage telemetry (last-used stamp) is owned by the caller — this module
    // stays strictly read-only against the database.
    try { onAuthenticated?.(agent); } catch { /* never block the request */ }

    try {
      const server = buildAgentMcpServer({ agent, supabase, log });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log(`[MCP] ${agent.slug}: request error ${err.message}`);
      if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
    }
  });

  // Stateless mode: no SSE stream to resume, no session to delete.
  const methodNotAllowed = (req, res) => jsonRpcError(res, 405, -32000, 'Method not allowed (stateless MCP: gunakan POST)');
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  // Admin key-management invalidation hook (server.js calls this after
  // generate/revoke so a rotated key takes effect immediately).
  return { invalidateKeyCache: () => keyCache.clear() };
}
