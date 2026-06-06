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
import { serializeScheduleRows, hasValidPricing } from './lib/umroh-schedules.js';
import {
  pickBrochurePackageDetails,
  extractDurationFromName,
  countBrochureTripDays,
} from './lib/brochure-schedule.js';

const KEY_PREFIX = 'alhijaz_mcp_';
const KEY_HEX_LEN = 48; // 24 random bytes
const RATE_LIMIT_PER_MINUTE = 30;
const IP_RATE_LIMIT_PER_MINUTE = 100; // per-source-IP ceiling (above per-key)
const KEY_CACHE_TTL_MS = 60_000;
const MAX_LIMIT = 50;

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

// ── Kalkulasi harga paket — replicates the KalkulasiPage summary formula
// (src/components/KalkulasiPage.tsx ~922-966) so the MCP answer matches what
// the agent sees on the dashboard. Room counts are PAX counts per room type
// (each pax pays that room type's per-person rate).
const KALKULASI_INFANT_FALLBACK = 8_500_000;
const ANAK_TANPA_KASUR_DISC_NORMAL = 3_500_000;
const ANAK_TANPA_KASUR_DISC_PROMO = 3_000_000;
const ANAK_TANPA_KASUR_DISC_RAHMAH = 5_500_000;

const toCount = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

export function computeKalkulasi(paket, input = {}) {
  const paketHarga = paket?.paket_harga && typeof paket.paket_harga === 'object' ? paket.paket_harga : {};
  const tierKeys = Object.keys(paketHarga);
  if (tierKeys.length === 0) return { error: 'Paket tidak punya data harga' };

  // Case-insensitive tier match; default to the first tier like the dashboard.
  const requested = String(input.tier || '').trim().toUpperCase();
  const tierKey = tierKeys.find((k) => k.toUpperCase() === requested) || tierKeys[0];
  const tier = paketHarga[tierKey] || {};

  const prices = {
    quad: parseInt(tier.Quard || '0', 10) || 0,
    triple: parseInt(tier.Triple || '0', 10) || 0,
    double: parseInt(tier.Double || '0', 10) || 0,
    single: parseInt(tier.Single || '0', 10) || 0,
    infant: parseInt(tier.Infant || '0', 10) || KALKULASI_INFANT_FALLBACK,
  };

  const rooms = {
    quad: toCount(input.kamar_quad),
    triple: toCount(input.kamar_triple),
    double: toCount(input.kamar_double),
    single: toCount(input.kamar_single),
  };
  const anakTanpaKasur = toCount(input.anak_tanpa_kasur);
  const infant = toCount(input.infant);

  const items = [];
  const pushRoom = (label, qty, unitPrice) => {
    if (qty > 0 && unitPrice > 0) items.push({ label, qty, harga_satuan: unitPrice, total: qty * unitPrice });
  };
  pushRoom('Dewasa Quad Room', rooms.quad, prices.quad);
  pushRoom('Dewasa Triple Room', rooms.triple, prices.triple);
  pushRoom('Dewasa Double Room', rooms.double, prices.double);
  pushRoom('Dewasa Single Room', rooms.single, prices.single);

  if (anakTanpaKasur > 0 && prices.quad > 0) {
    const pkgName = String(paket?.jadwal_nama || '').toUpperCase();
    const activeTier = tierKey.toUpperCase();
    const isRahmah = activeTier.includes('RAHMAH') || (!activeTier && pkgName.includes('RAHMAH'));
    const isPromo = String(paket?.promo || '') === '1' || pkgName.includes('PROMO');
    const disc = isRahmah
      ? ANAK_TANPA_KASUR_DISC_RAHMAH
      : isPromo
        ? ANAK_TANPA_KASUR_DISC_PROMO
        : ANAK_TANPA_KASUR_DISC_NORMAL;
    const anakPrice = Math.max(0, prices.quad - disc);
    items.push({
      label: 'Anak (tanpa Kasur)',
      qty: anakTanpaKasur,
      harga_satuan: anakPrice,
      total: anakTanpaKasur * anakPrice,
      catatan: `harga quad ${prices.quad.toLocaleString('id-ID')} - diskon anak ${disc.toLocaleString('id-ID')}`,
    });
  }
  if (infant > 0) {
    items.push({ label: 'Infant (0-23 bln)', qty: infant, harga_satuan: prices.infant, total: infant * prices.infant });
  }

  if (items.length === 0) {
    return { error: 'Tidak ada item — isi minimal satu jumlah kamar/anak/infant (atau tipe kamar tsb tidak tersedia di paket ini)' };
  }

  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  // Per-pax discount counts room pax + anak tanpa kasur; infant excluded —
  // same as the dashboard (totalJamaah = dewasa + balitaKasur + balitaTanpaKasur).
  const totalPaxDiskon = rooms.quad + rooms.triple + rooms.double + rooms.single + anakTanpaKasur;
  const diskonPerPax = Math.max(0, Number(input.diskon_per_pax) || 0);
  const diskonFlat = Math.max(0, Number(input.diskon_flat) || 0);
  const diskon = diskonPerPax * totalPaxDiskon + diskonFlat;
  const grandTotal = Math.max(0, subtotal - diskon);

  return {
    paket: paket?.jadwal_nama || null,
    jadwal_id: paket?.jadwal_id || null,
    tier_dipakai: tierKey,
    tier_tersedia: tierKeys,
    items,
    subtotal,
    diskon,
    grand_total: grandTotal,
    total_pax: totalPaxDiskon + infant,
  };
}

// Compact list row for jadwal tools — full pricing/hotel/URLs live in
// get_jadwal_paket to keep list responses small.
export function summarizeJadwalRow(row) {
  const seatSisa = Number.parseInt(row?.seat_sisa, 10);
  const cheapest = pickBrochurePackageDetails(row?.paket_harga, null);
  return {
    jadwal_id: row?.jadwal_id,
    nama: row?.jadwal_nama,
    promo: String(row?.promo || '') === '1',
    berangkat_tgl: row?.berangkat_tgl,
    berangkat_jam: row?.berangkat_jam || null,
    pulang_tgl: row?.pulang_tgl,
    durasi_hari: extractDurationFromName(row?.jadwal_nama)
      ?? countBrochureTripDays(row?.berangkat_tgl, row?.pulang_tgl),
    maskapai: row?.maskapai || null,
    seat_total: Number.parseInt(row?.seat_total, 10) || null,
    seat_sisa: Number.isFinite(seatSisa) ? seatSisa : null,
    sold_out: Number.isFinite(seatSisa) && seatSisa <= 0,
    harga_mulai: cheapest?.harga ?? null,
    tier_termurah: cheapest?.tier ?? null,
    manasik_tgl: row?.manasik_tgl || null,
    manasik_jam: row?.manasik_jam || null,
  };
}

// calendar_events stores people as "•  NAMA" and empty values as "-".
export function cleanCalendarPerson(value) {
  const cleaned = String(value || '').replace(/^[•\s]+/, '').trim();
  return cleaned && cleaned !== '-' ? cleaned : null;
}

// Newest sync wins when the same jadwal_id exists under several year codes.
function dedupeJadwalRows(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    if (!row?.jadwal_id) continue;
    const current = byId.get(row.jadwal_id);
    if (!current || String(row.synced_at || '') > String(current.synced_at || '')) {
      byId.set(row.jadwal_id, row);
    }
  }
  return [...byId.values()];
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

const GLOBAL_NOTE = 'Data operasional global Alhijaz (sama untuk semua agent), snapshot hasil sync berkala — bukan real-time.';

// 'YYYY-MM' → ISO date of the first day of the FOLLOWING month (exclusive upper bound).
function nextMonthISO(month) {
  const [y, m] = String(month).split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

// zod's regex guards shape only ('2026-13-45' passes) — validate the actual
// calendar value so an impossible date can't reach Postgres and bounce back a
// raw error. Returns true only for a real Y-M-D.
export function isRealISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return false;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +mo - 1 && dt.getUTCDate() === +d;
}

export function isRealMonth(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s));
  if (!m) return false;
  const mo = +m[2];
  return mo >= 1 && mo <= 12;
}

// Passport number is high-sensitivity PII; the full value rarely helps an AI
// assistant (paspor_expired covers validity). Expose only the last 4 digits so
// the agent can still identify a document without handing the whole number to a
// third-party LLM.
export function maskPassport(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`;
}

const LIST_FIELDS = 'id_umroh, jm_id, nama, jk, wa, paket, bayar, sisa, tgl_berangkat, tgl_daftar, notes, synced_at';
const DETAIL_FIELDS = `${LIST_FIELDS}, tgl_lahir, no_paspor, paspor_expired, perlengkapan, dokumen, diskon_kantor, diskon_marketing, hijriah_year`;

function toolResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 1) }] };
}

function toolError(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function buildAgentMcpServer({ agent, supabase, log }) {
  const server = new McpServer({ name: 'alhijaz', version: '1.0.0' });

  const register = (name, config, handler) => {
    server.registerTool(name, config, async (args = {}) => {
      // Log only WHICH params were used, never their values — search/jm_id can
      // carry jamaah names/phones (PII) into journald.
      log(`[MCP] ${agent.slug}: ${name} (${Object.keys(args || {}).join(',') || 'no args'})`);
      try {
        return await handler(args);
      } catch (err) {
        // Real DB/internal error stays in the server log; the client gets a
        // generic message so Postgres internals never leak downstream.
        log(`[MCP] ${agent.slug}: ${name} ERROR ${err.message}`);
        return toolError('Terjadi kesalahan internal saat memproses permintaan. Coba lagi.');
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
      jamaah: { ...row, no_paspor: maskPassport(row.no_paspor), payment_status: classifyPaymentStatus(row) },
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

  // ── Data operasional Alhijaz (global — sama untuk semua agent, seperti yang
  // tampil di dashboard & landing page publik) ──

  register('list_jadwal_paket', {
    title: 'Jadwal paket umroh',
    description: 'Daftar jadwal paket umroh Alhijaz (data global, bukan per-agent): tanggal berangkat/pulang, '
      + 'durasi, maskapai, sisa seat / sold out, harga mulai (tier termurah), jadwal manasik. '
      + 'Gunakan get_jadwal_paket untuk harga lengkap per tipe kamar, hotel, link brosur & itinerary. '
      + GLOBAL_NOTE,
    inputSchema: {
      month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Filter bulan keberangkatan, format YYYY-MM'),
      search: z.string().max(80).optional().describe('Cari di nama paket, mis. "TURKEY" atau "PROMO"'),
      promo_only: z.boolean().optional(),
      available_only: z.boolean().optional().describe('Hanya paket yang masih ada seat'),
      include_departed: z.boolean().optional().describe('Sertakan keberangkatan yang sudah lewat (default tidak)'),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    },
  }, async ({ month, search, promo_only, available_only, include_departed, page = 1, limit = 20 }) => {
    if (month && !isRealMonth(month)) return toolError('Bulan tidak valid — pakai format YYYY-MM dengan bulan 01-12');
    const today = jakartaToday();
    const FETCH_CAP = 500;
    let q = supabase
      .from('umroh_schedules')
      .select('jadwal_id, jadwal_nama, promo, seat_total, seat_sisa, maskapai, berangkat_tgl, berangkat_jam, pulang_tgl, manasik_tgl, manasik_jam, paket_harga, synced_at')
      .order('berangkat_tgl', { ascending: true })
      .limit(FETCH_CAP);

    if (month) {
      q = q.gte('berangkat_tgl', `${month}-01`).lt('berangkat_tgl', nextMonthISO(month));
    } else if (!include_departed) {
      q = q.gte('berangkat_tgl', today);
    }
    const term = sanitizeSearchTerm(search);
    if (term) q = q.ilike('jadwal_nama', `*${term}*`);
    if (promo_only) q = q.eq('promo', '1');

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    let rows = dedupeJadwalRows(data).filter((row) => hasValidPricing(row.paket_harga)).map(summarizeJadwalRow);
    if (available_only) rows = rows.filter((row) => !row.sold_out);

    const cappedLimit = Math.min(Number(limit) || 20, MAX_LIMIT);
    const offset = (Math.max(1, Number(page) || 1) - 1) * cappedLimit;
    const truncated = (data?.length || 0) >= FETCH_CAP;
    return toolResult({
      total: rows.length,
      page: Math.max(1, Number(page) || 1),
      limit: cappedLimit,
      rows: rows.slice(offset, offset + cappedLimit),
      ...(truncated ? { truncated: true, truncated_note: `Hasil dibatasi ${FETCH_CAP} jadwal teratas — persempit dengan filter month/search.` } : {}),
      note: GLOBAL_NOTE,
    });
  });

  register('get_jadwal_paket', {
    title: 'Detail paket umroh',
    description: 'Detail lengkap satu paket by jadwal_id: harga per tier & tipe kamar (paket_harga), hotel Mekkah/Madinah '
      + 'per tier (paket_hotel), rute & jam penerbangan berangkat/pulang, manasik, sisa seat, '
      + 'plus link publik brosur (gambar) dan itinerary (PDF) yang bisa dibuka langsung. ' + GLOBAL_NOTE,
    inputSchema: {
      jadwal_id: z.string().min(2).max(30).describe('ID jadwal dari list_jadwal_paket, mis. JBU1484'),
    },
  }, async ({ jadwal_id }) => {
    const { data, error } = await supabase
      .from('umroh_schedules')
      .select('*')
      .eq('jadwal_id', String(jadwal_id).trim().toUpperCase());
    if (error) throw new Error(error.message);
    const row = dedupeJadwalRows(data)[0];
    if (!row) return toolError(`Paket dengan jadwal_id ${jadwal_id} tidak ditemukan`);

    const [serialized] = serializeScheduleRows([row]);
    return toolResult({
      paket: { ...serialized, ...summarizeJadwalRow(row) },
      note: `Link brosur/itinerary publik — bisa langsung dibuka/dibagikan. ${GLOBAL_NOTE}`,
    });
  });

  register('kalkulasi_harga', {
    title: 'Kalkulasi harga paket',
    description: 'Hitung total harga satu paket persis seperti tool Kalkulasi di dashboard. '
      + 'Jumlah kamar = jumlah ORANG per tipe kamar (harga per orang). Anak tanpa kasur dihitung dari harga quad '
      + 'dikurangi diskon anak (RAHMAH 5,5jt / PROMO 3jt / lainnya 3,5jt); infant pakai harga Infant paket (fallback 8,5jt). '
      + 'Diskon per-pax tidak menghitung infant.',
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
  }, async (args) => {
    const { data, error } = await supabase
      .from('umroh_schedules')
      .select('jadwal_id, jadwal_nama, promo, paket_harga, synced_at')
      .eq('jadwal_id', String(args.jadwal_id).trim().toUpperCase());
    if (error) throw new Error(error.message);
    const row = dedupeJadwalRows(data)[0];
    if (!row) return toolError(`Paket dengan jadwal_id ${args.jadwal_id} tidak ditemukan`);

    const result = computeKalkulasi(row, args);
    if (result.error) return toolError(result.error);
    return toolResult(result);
  });

  register('calendar_events', {
    title: 'Kalender manasik / keberangkatan / kepulangan',
    description: 'Agenda Alhijaz dari kalender internal: manasik, keberangkatan, dan kepulangan per grup — '
      + 'termasuk paket, pesawat, jam, jumlah pax, Tour Leader (TL), staff, dan jam/titik kumpul bila ada. '
      + 'Untuk tahu siapa TL sebuah keberangkatan, cari event keberangkatan grup tersebut. ' + GLOBAL_NOTE,
    inputSchema: {
      type: z.enum(['manasik', 'keberangkatan', 'kepulangan']).optional().describe('Default semua tipe'),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Tanggal mulai, default hari ini'),
      days: z.number().int().min(1).max(120).optional().describe('Rentang hari ke depan, default 30'),
      search: z.string().max(80).optional().describe('Cari di nama paket / nama Tour Leader / nomor grup'),
    },
  }, async ({ type, from, days = 30, search }) => {
    if (from && !isRealISODate(from)) return toolError('Tanggal "from" tidak valid — pakai format YYYY-MM-DD yang benar');
    const start = from || jakartaToday();
    const end = addDaysISO(start, Math.min(Number(days) || 30, 120));
    const FETCH_CAP = 150;
    let q = supabase
      .from('calendar_events')
      .select('event_date, event_type, group_number, paket, pesawat, jam, pax, tour_leader, staff, jam_kumpul, titik_kumpul')
      .gte('event_date', start)
      .lte('event_date', end)
      .order('event_date', { ascending: true })
      .limit(FETCH_CAP);
    if (type) q = q.eq('event_type', type);
    const term = sanitizeSearchTerm(search);
    if (term) q = q.or(`paket.ilike.*${term}*,tour_leader.ilike.*${term}*,group_number.ilike.*${term}*`);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const truncated = (data?.length || 0) >= FETCH_CAP;

    const rows = (data || []).map((row) => ({
      tanggal: row.event_date,
      tipe: row.event_type,
      grup: row.group_number || null,
      paket: row.paket || null,
      pesawat: row.pesawat || null,
      jam: row.jam || null,
      pax: row.pax ?? null,
      tour_leader: cleanCalendarPerson(row.tour_leader),
      staff: cleanCalendarPerson(row.staff),
      jam_kumpul: row.jam_kumpul || null,
      titik_kumpul: row.titik_kumpul || null,
    }));

    return toolResult({
      from: start, to: end, total: rows.length, rows,
      ...(truncated ? { truncated: true, truncated_note: `Hasil dibatasi ${FETCH_CAP} event teratas — persempit rentang (days) atau pakai filter type/search.` } : {}),
      note: GLOBAL_NOTE,
    });
  });

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
    if (!ipLimiter(clientIp)) return jsonRpcError(res, 429, -32002, `Rate limit: terlalu banyak request dari IP ini (max ${IP_RATE_LIMIT_PER_MINUTE}/menit)`);

    const token = parseMcpBearer(req.headers.authorization);
    if (!token) return jsonRpcError(res, 401, -32001, 'Unauthorized: kirim header Authorization: Bearer alhijaz_mcp_...');
    if (!rateLimiter(token)) return jsonRpcError(res, 429, -32002, `Rate limit: max ${RATE_LIMIT_PER_MINUTE} request/menit per key`);

    let agent;
    try {
      agent = await resolveAgent(token);
    } catch (err) {
      log(`[MCP] auth lookup error: ${err.message}`);
      return jsonRpcError(res, 503, -32003, 'Auth lookup failed, coba lagi');
    }
    if (!agent) return jsonRpcError(res, 401, -32001, 'Unauthorized: API key tidak dikenal atau agent non-aktif');

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
