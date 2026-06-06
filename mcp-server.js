// MCP server (Model Context Protocol) — read-only data access for per-agent AI
// assistants (hermes/openclaw-style agents running on their own machines).
//
// Design (2026-06-06):
// - Streamable HTTP transport in STATELESS mode (new server+transport per
//   request, sessionIdGenerator: undefined) mounted at POST /mcp on the main
//   Express app — no extra port/service, survives miqot.service restarts.
// - Auth: `Authorization: Bearer miqot_mcp_<48 hex>` — per-agent key stored in
//   agents.mcp_api_key (generated/revoked by admin endpoints in server.js).
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

const KEY_PREFIX = 'miqot_mcp_';
const KEY_HEX_LEN = 48; // 24 random bytes
const RATE_LIMIT_PER_MINUTE = 30;
const KEY_CACHE_TTL_MS = 60_000;
const MAX_LIMIT = 50;

export function generateMcpApiKey() {
  return KEY_PREFIX + crypto.randomBytes(KEY_HEX_LEN / 2).toString('hex');
}

export function parseMcpBearer(header) {
  if (typeof header !== 'string') return null;
  const m = header.match(/^Bearer\s+(miqot_mcp_[a-f0-9]{48})\s*$/i);
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

// Same buckets as the dashboard filters (belum_dp/belum_lunas/lunas/lebih_bayar).
export function classifyPaymentStatus(row) {
  const bayar = Number(row?.bayar || 0);
  const sisa = Number(row?.sisa ?? 0);
  if (!(bayar > 0)) return 'belum_dp';
  if (sisa > 0) return 'belum_lunas';
  if (sisa < 0) return 'lebih_bayar';
  return 'lunas';
}

export function summarizePayments(rows) {
  const summary = {
    total_pax: 0,
    belum_dp: 0,
    belum_lunas: 0,
    lunas: 0,
    lebih_bayar: 0,
    total_outstanding: 0,
    by_departure_month: {},
  };
  for (const row of rows || []) {
    const bucket = classifyPaymentStatus(row);
    summary.total_pax += 1;
    summary[bucket] += 1;
    const sisa = Number(row?.sisa || 0);
    if (sisa > 0) summary.total_outstanding += sisa;

    const month = String(row?.tgl_berangkat || '').slice(0, 7) || 'unknown';
    let m = summary.by_departure_month[month];
    if (!m) {
      m = { pax: 0, belum_dp: 0, belum_lunas: 0, lunas: 0, lebih_bayar: 0, outstanding: 0 };
      summary.by_departure_month[month] = m;
    }
    m.pax += 1;
    m[bucket] += 1;
    if (sisa > 0) m.outstanding += sisa;
  }
  return summary;
}

// PostgREST `.or()` filter values — strip syntax characters so user search
// input can never break out of the ilike pattern.
function sanitizeSearchTerm(value) {
  return String(value || '').replace(/[,()%\\]/g, ' ').trim().slice(0, 80);
}

function jakartaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function addDaysISO(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

// Days until the next occurrence of a birthday, relative to `todayStr`
// (YYYY-MM-DD). Returns null for unparseable dates.
export function daysUntilNextBirthday(tglLahir, todayStr) {
  const m = String(tglLahir || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, , mm, dd] = m;
  const today = new Date(`${todayStr}T00:00:00Z`);
  let next = new Date(`${todayStr.slice(0, 4)}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(next.getTime())) {
    if (mm === '02' && dd === '29') next = new Date(`${todayStr.slice(0, 4)}-03-01T00:00:00Z`);
    else return null;
  }
  if (next < today) next.setUTCFullYear(next.getUTCFullYear() + 1);
  return Math.round((next - today) / 86_400_000);
}

const DATA_NOTE = 'Data adalah snapshot hasil sync dari sistem Alhijaz (lihat synced_at per baris), bukan real-time. '
  + 'Field bayar/sisa untuk booking yang SUDAH BERANGKAT bisa tidak akurat (data historis upstream) — jangan dipakai untuk tagihan.';

const LIST_FIELDS = 'id_umroh, jm_id, nama, jk, wa, paket, bayar, sisa, tgl_berangkat, tgl_daftar, notes, synced_at';
const DETAIL_FIELDS = `${LIST_FIELDS}, tgl_lahir, no_paspor, paspor_expired, perlengkapan, dokumen, diskon_kantor, diskon_marketing, hijriah_year`;

function toolResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 1) }] };
}

function toolError(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function buildAgentMcpServer({ agent, supabase, log }) {
  const server = new McpServer({ name: 'miqot-jamaah', version: '1.0.0' });

  const register = (name, config, handler) => {
    server.registerTool(name, config, async (args = {}) => {
      log(`[MCP] ${agent.slug}: ${name} ${JSON.stringify(args)}`);
      try {
        return await handler(args);
      } catch (err) {
        log(`[MCP] ${agent.slug}: ${name} ERROR ${err.message}`);
        return toolError(err.message);
      }
    });
  };

  register('list_jamaah', {
    title: 'Daftar jamaah',
    description: 'Daftar jamaah umroh milik agent ini (paginated, max 50/baris per halaman). '
      + 'Filter: status pembayaran, window keberangkatan, atau cari nama/ID booking/nomor WA. '
      + DATA_NOTE,
    inputSchema: {
      search: z.string().max(80).optional().describe('Cari di nama, id_umroh, atau nomor WA'),
      payment_status: z.enum(['belum_dp', 'belum_lunas', 'lunas', 'lebih_bayar']).optional(),
      departure: z.enum(['30', '60', '90', 'all_upcoming', 'departed', 'all']).optional()
        .describe('Window keberangkatan dalam hari ke depan; default all_upcoming'),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    },
  }, async ({ search, payment_status, departure = 'all_upcoming', page = 1, limit = 20 }) => {
    const today = jakartaToday();
    let q = supabase
      .from('jamaah')
      .select(LIST_FIELDS, { count: 'exact' })
      .eq('agent_id', agent.id);

    if (departure === 'departed') q = q.lt('tgl_berangkat', today);
    else if (departure === 'all_upcoming') q = q.gte('tgl_berangkat', today);
    else if (departure !== 'all') q = q.gte('tgl_berangkat', today).lte('tgl_berangkat', addDaysISO(today, Number(departure)));

    if (payment_status === 'belum_dp') q = q.lte('bayar', 0);
    else if (payment_status === 'belum_lunas') q = q.gt('bayar', 0).gt('sisa', 0);
    else if (payment_status === 'lunas') q = q.gt('bayar', 0).eq('sisa', 0);
    else if (payment_status === 'lebih_bayar') q = q.lt('sisa', 0);

    const term = sanitizeSearchTerm(search);
    if (term) q = q.or(`nama.ilike.*${term}*,id_umroh.ilike.*${term}*,wa.ilike.*${term}*`);

    const cappedLimit = Math.min(Number(limit) || 20, MAX_LIMIT);
    const offset = (Math.max(1, Number(page) || 1) - 1) * cappedLimit;
    q = q.order('tgl_berangkat', { ascending: departure !== 'departed', nullsFirst: false })
      .range(offset, offset + cappedLimit - 1);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return toolResult({
      total: count ?? data?.length ?? 0,
      page: Math.max(1, Number(page) || 1),
      limit: cappedLimit,
      rows: (data || []).map((row) => ({ ...row, payment_status: classifyPaymentStatus(row) })),
      note: DATA_NOTE,
    });
  });

  register('get_jamaah', {
    title: 'Detail jamaah',
    description: 'Detail satu jamaah berdasarkan jm_id (dari list_jamaah), termasuk dokumen, '
      + 'perlengkapan, dan anggota lain dalam booking yang sama. ' + DATA_NOTE,
    inputSchema: {
      jm_id: z.string().min(3).max(40).describe('ID jamaah, mis. JM999999990000063643'),
    },
  }, async ({ jm_id }) => {
    const { data, error } = await supabase
      .from('jamaah')
      .select(DETAIL_FIELDS)
      .eq('agent_id', agent.id)
      .eq('jm_id', String(jm_id).trim())
      .limit(2);
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row) return toolError(`Jamaah dengan jm_id ${jm_id} tidak ditemukan untuk agent ini`);

    let bookingMembers = [];
    if (row.id_umroh) {
      const { data: members } = await supabase
        .from('jamaah')
        .select('jm_id, nama, bayar, sisa')
        .eq('agent_id', agent.id)
        .eq('id_umroh', row.id_umroh)
        .neq('jm_id', row.jm_id)
        .limit(20);
      bookingMembers = members || [];
    }

    return toolResult({
      jamaah: { ...row, payment_status: classifyPaymentStatus(row) },
      booking_members: bookingMembers,
      note: DATA_NOTE,
    });
  });

  register('jamaah_birthdays', {
    title: 'Ulang tahun jamaah',
    description: 'Jamaah yang berulang tahun dalam N hari ke depan — berguna untuk ucapan/follow-up.',
    inputSchema: {
      within_days: z.enum(['7', '30', '60', '90']).optional().describe('Default 30'),
    },
  }, async ({ within_days = '30' }) => {
    const today = jakartaToday();
    const { data, error } = await supabase
      .from('jamaah')
      .select('jm_id, nama, wa, tgl_lahir, tgl_berangkat, synced_at')
      .eq('agent_id', agent.id)
      .not('tgl_lahir', 'is', null);
    if (error) throw new Error(error.message);

    const horizon = Number(within_days);
    const upcoming = (data || [])
      .map((row) => ({ ...row, days_until_birthday: daysUntilNextBirthday(row.tgl_lahir, today) }))
      .filter((row) => row.days_until_birthday !== null && row.days_until_birthday <= horizon)
      .sort((a, b) => a.days_until_birthday - b.days_until_birthday)
      .slice(0, MAX_LIMIT);

    return toolResult({ today, within_days: horizon, total: upcoming.length, rows: upcoming });
  });

  register('payment_summary', {
    title: 'Ringkasan pembayaran',
    description: 'Agregat status pembayaran jamaah dengan keberangkatan mendatang: jumlah pax per '
      + 'bucket (belum_dp/belum_lunas/lunas/lebih_bayar), total outstanding, breakdown per bulan keberangkatan. '
      + DATA_NOTE,
    inputSchema: {},
  }, async () => {
    const today = jakartaToday();
    const { data, error } = await supabase
      .from('jamaah')
      .select('bayar, sisa, tgl_berangkat')
      .eq('agent_id', agent.id)
      .gte('tgl_berangkat', today);
    if (error) throw new Error(error.message);
    return toolResult({ as_of: today, ...summarizePayments(data || []), note: DATA_NOTE });
  });

  return server;
}

function jsonRpcError(res, status, code, message) {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

export function initMcpServer(app, { supabase, log = console.log } = {}) {
  if (!supabase) throw new Error('initMcpServer: supabase client is required');

  const rateLimiter = createRateLimiter();
  // token -> { agent|null, expiresAt }; negative entries stop bad keys from
  // hammering the DB between rate-limit windows.
  const keyCache = new Map();

  const resolveAgent = async (token) => {
    const cached = keyCache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.agent;
    const { data, error } = await supabase
      .from('agents')
      .select('id, slug, name, status')
      .eq('mcp_api_key', token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const agent = data && data.status === 'active' ? data : null;
    keyCache.set(token, { agent, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
    if (keyCache.size > 1000) keyCache.clear();
    return agent;
  };

  app.post('/mcp', async (req, res) => {
    const token = parseMcpBearer(req.headers.authorization);
    if (!token) return jsonRpcError(res, 401, -32001, 'Unauthorized: kirim header Authorization: Bearer miqot_mcp_...');
    if (!rateLimiter(token)) return jsonRpcError(res, 429, -32002, `Rate limit: max ${RATE_LIMIT_PER_MINUTE} request/menit per key`);

    let agent;
    try {
      agent = await resolveAgent(token);
    } catch (err) {
      log(`[MCP] auth lookup error: ${err.message}`);
      return jsonRpcError(res, 503, -32003, 'Auth lookup failed, coba lagi');
    }
    if (!agent) return jsonRpcError(res, 401, -32001, 'Unauthorized: API key tidak dikenal atau agent non-aktif');

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
