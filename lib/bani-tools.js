// Registry tool bersama untuk DUA permukaan AI yang membaca data Alhijaz:
// - MCP eksternal per-agent (mcp-server.js, POST /mcp) — asisten milik agent
//   sendiri (hermes/openclaw) memakai skema zod + envelope content MCP.
// - Bani, asisten AI in-app di dashboard (function calling) — memakai
//   `parameters` (JSON Schema polos) + hasil netral dari `run()`.
//
// Kontrak `run(deps, args)` sengaja NETRAL terhadap permukaan:
//   sukses → { ok: true,  data }
//   gagal  → { ok: false, error }
// Pemetaan ke bentuk khas permukaan (content MCP, atau pesan tool Bani) adalah
// urusan pemanggil, bukan handler.
//
// READ-ONLY by design: modul ini tidak boleh memanggil .insert/.update/
// .upsert/.delete/.rpc — dijaga source grep di tests/bani-tools.test.js
// (cerminan guard yang sama di tests/mcp-server.test.js untuk mcp-server.js).
//
// Setiap query tabel jamaah HARUS ter-scope ke agent terautentikasi lewat
// filter agent_id — kontrak isolasi yang sama dengan REST API, dihitung
// pasangannya oleh guard source di tests/mcp-server.test.js.
import { serializeScheduleRows, hasValidPricing } from './umroh-schedules.js';
import { collapseBookingOutstanding } from './booking-outstanding.js';
import {
  pickBrochurePackageDetails,
  extractDurationFromName,
  countBrochureTripDays,
} from './brochure-schedule.js';

export const MAX_LIMIT = 50;

// Same buckets as the dashboard filters (server.js payment_status switch,
// ~9138-9151): sisa drives the bucket — sisa null/0 = lunas TERLEPAS dari
// bayar; bayar hanya membelah sisa>0 menjadi belum_dp vs belum_lunas.
export function classifyPaymentStatus(row) {
  const bayar = Number(row?.bayar || 0);
  const sisa = Number(row?.sisa ?? 0);
  if (sisa < 0) return 'lebih_bayar';
  if (sisa > 0) return bayar > 0 ? 'belum_lunas' : 'belum_dp';
  return 'lunas';
}

// groupBy 'month' (default) atau 'date' — 'date' menjawab pertanyaan
// per-tanggal keberangkatan ("berapa jamaah berangkat 13 Juni?").
export function summarizePayments(rows, { groupBy = 'month' } = {}) {
  const byDate = groupBy === 'date';
  const breakdownKey = byDate ? 'by_departure_date' : 'by_departure_month';
  const summary = {
    total_pax: 0,
    belum_dp: 0,
    belum_lunas: 0,
    lunas: 0,
    lebih_bayar: 0,
    total_outstanding: 0,
    [breakdownKey]: {},
  };
  const bucketKeyOf = (row) => String(row?.tgl_berangkat || '').slice(0, byDate ? 10 : 7) || 'unknown';
  const ensureBucket = (key) => {
    let m = summary[breakdownKey][key];
    if (!m) {
      m = { pax: 0, belum_dp: 0, belum_lunas: 0, lunas: 0, lebih_bayar: 0, outstanding: 0 };
      summary[breakdownKey][key] = m;
    }
    return m;
  };

  for (const row of rows || []) {
    const bucket = classifyPaymentStatus(row);
    summary.total_pax += 1;
    summary[bucket] += 1;
    const m = ensureBucket(bucketKeyOf(row));
    m.pax += 1;
    m[bucket] += 1;
  }

  // Outstanding via fold shape-aware bersama (lib/booking-outstanding.js —
  // dipakai juga stats dashboard): per-pax Σ sisa, aggregate-shape max sisa,
  // hanya booking yang sudah mulai bayar.
  for (const b of collapseBookingOutstanding(rows)) {
    summary.total_outstanding += b.outstanding;
    ensureBucket(bucketKeyOf(b.firstRow)).outstanding += b.outstanding;
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

// Nama paket manasik legacy menempelkan tanggal berangkat kloter sebagai prefix
// "DD/MM/YYYYNAMA PAKET" — pisahkan persis seperti parsePaket di dashboard
// (src/components/UpcomingSchedule.tsx) supaya asisten AI melihat nama paket
// yang sama dengan yang tampil di kalender dashboard. Pembersihan tetap di
// layer presentasi (data tersimpan apa adanya — keputusan 2026-06).
export function cleanCalendarPaket(value) {
  const raw = String(value || '').trim();
  if (!raw) return { paket: null, kloter_berangkat_tgl: null };
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(.+)$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return { paket: raw, kloter_berangkat_tgl: null };
  return { paket: m[4].trim(), kloter_berangkat_tgl: `${m[3]}-${m[2]}-${m[1]}` };
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

// `paket` di tabel jamaah adalah TIER (HEMAT/RAHMAH/UHUD), bukan nama paket —
// dikonfirmasi di data produksi: jamaah ber-paket "HEMAT" bisa terdaftar di
// JBU1528 yang bernama "PROMO UMRAH 9HR". Nama lengkapnya cuma ada di
// umroh_schedules.jadwal_nama, dan satu-satunya tautan yang sahih adalah
// raw_data.id_jadwal (ada di 200/200 baris jamaah mendatang saat diperiksa).
// Menebak nama dari tier akan salah, jadi jangan.
const LIST_FIELDS = 'id_umroh, jm_id, nama, jk, wa, paket, bayar, sisa, tgl_berangkat, tgl_daftar, notes, synced_at, jadwal_id:raw_data->>id_jadwal';
const DETAIL_FIELDS = `${LIST_FIELDS}, tgl_lahir, no_paspor, paspor_expired, perlengkapan, dokumen, diskon_kantor, diskon_marketing, hijriah_year`;

// Hasil netral — pemanggil (mcp-server.js / endpoint Bani) yang membungkusnya
// ke bentuk khas permukaan masing-masing.
function toolResult(payload) {
  return { ok: true, data: payload };
}

function toolError(message) {
  return { ok: false, error: message };
}

// Melengkapi baris jamaah dengan `paket_nama` (nama paket lengkap) lewat
// jadwal_id. Satu query untuk seluruh halaman, bukan per baris. Gagal ke arah
// aman: kalau lookup-nya error atau jadwal_id kosong, `paket_nama` null dan
// pemanggil jatuh ke tier di `paket` — tidak pernah menahan hasil utamanya.
async function attachPaketNama(supabase, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const ids = [...new Set(list.map((r) => r?.jadwal_id).filter(Boolean).map((v) => String(v).toUpperCase()))];
  if (!ids.length) return list.map((row) => ({ ...row, paket_nama: null }));

  let byId = new Map();
  try {
    const { data } = await supabase
      .from('umroh_schedules')
      .select('jadwal_id, jadwal_nama')
      .in('jadwal_id', ids);
    byId = new Map((data || []).map((r) => [String(r.jadwal_id).toUpperCase(), r.jadwal_nama || null]));
  } catch {
    // Nama lengkap sekadar pelengkap — daftar jamaahnya tetap harus terkirim.
  }
  return list.map((row) => ({
    ...row,
    paket_nama: row?.jadwal_id ? byId.get(String(row.jadwal_id).toUpperCase()) || null : null,
  }));
}

// JSON Schema polos, mencerminkan inputSchema zod di mcp-server.js satu-satu.
// Ditulis manual — tidak menambah dependency zod-to-json-schema.
const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

export const BANI_TOOLS = [
  {
    name: 'list_jamaah',
    title: 'Daftar jamaah',
    description: 'Daftar jamaah umroh milik agent ini (paginated, max 50/baris per halaman). '
      + 'Filter: status pembayaran, window keberangkatan (departure), TANGGAL/rentang keberangkatan eksak '
      + '(departure_from/departure_to — pakai ini untuk pertanyaan seperti "siapa/berapa yang berangkat 13 Juni"), '
      + 'atau cari nama/ID booking/nomor WA. Search tanpa departure mencakup SEMUA jamaah termasuk yang sudah berangkat. '
      + DATA_NOTE,
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', maxLength: 80, description: 'Cari di nama, id_umroh, atau nomor WA' },
        payment_status: { type: 'string', enum: ['belum_dp', 'belum_lunas', 'lunas', 'lebih_bayar'] },
        departure: {
          type: 'string',
          enum: ['30', '60', '90', 'all_upcoming', 'departed', 'all'],
          description: 'Window keberangkatan dalam hari ke depan; default all_upcoming (atau all saat search diisi). Untuk tanggal spesifik pakai departure_from/departure_to.',
        },
        departure_from: {
          type: 'string',
          pattern: ISO_DATE_PATTERN,
          description: 'Keberangkatan mulai tanggal ini (YYYY-MM-DD, inklusif). Untuk SATU tanggal eksak, isi sama dengan departure_to.',
        },
        departure_to: {
          type: 'string',
          pattern: ISO_DATE_PATTERN,
          description: 'Keberangkatan sampai tanggal ini (YYYY-MM-DD, inklusif)',
        },
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
      },
      required: [],
    },
    run: async ({ supabase, agent }, { search, payment_status, departure, departure_from, departure_to, page = 1, limit = 20 } = {}) => {
      if (departure_from && !isRealISODate(departure_from)) return toolError('departure_from tidak valid — pakai format YYYY-MM-DD yang benar');
      if (departure_to && !isRealISODate(departure_to)) return toolError('departure_to tidak valid — pakai format YYYY-MM-DD yang benar');
      const today = jakartaToday();
      const term = sanitizeSearchTerm(search);
      // Search tanpa window eksplisit harus mencakup SEMUA jamaah: nama yang
      // dicari bisa saja sudah berangkat — default all_upcoming membuat lookup
      // nama mengembalikan 0 yang menyesatkan ("jamaah X tidak ada" padahal ada).
      const effectiveDeparture = departure || (term ? 'all' : 'all_upcoming');
      let q = supabase
        .from('jamaah')
        .select(LIST_FIELDS, { count: 'exact' })
        .eq('agent_id', agent.id);

      const explicitRange = Boolean(departure_from || departure_to);
      if (explicitRange) {
        // Rentang tanggal eksplisit menang atas window departure.
        if (departure_from) q = q.gte('tgl_berangkat', departure_from);
        if (departure_to) q = q.lte('tgl_berangkat', departure_to);
      } else if (effectiveDeparture === 'departed') q = q.lt('tgl_berangkat', today);
      else if (effectiveDeparture === 'all_upcoming') q = q.gte('tgl_berangkat', today);
      else if (effectiveDeparture !== 'all') q = q.gte('tgl_berangkat', today).lte('tgl_berangkat', addDaysISO(today, Number(effectiveDeparture)));

      if (payment_status === 'belum_dp') q = q.lte('bayar', 0);
      else if (payment_status === 'belum_lunas') q = q.gt('bayar', 0).gt('sisa', 0);
      else if (payment_status === 'lunas') q = q.gt('bayar', 0).eq('sisa', 0);
      else if (payment_status === 'lebih_bayar') q = q.lt('sisa', 0);

      if (term) q = q.or(`nama.ilike.*${term}*,id_umroh.ilike.*${term}*,wa.ilike.*${term}*`);

      const cappedLimit = Math.min(Number(limit) || 20, MAX_LIMIT);
      const offset = (Math.max(1, Number(page) || 1) - 1) * cappedLimit;
      // jm_id sebagai tiebreaker: banyak row berbagi tgl_berangkat yang sama,
      // tanpa secondary sort urutan dalam grup tidak stabil antar-request dan
      // paginasi bisa duplikat/skip baris di batas halaman.
      q = q.order('tgl_berangkat', { ascending: explicitRange || effectiveDeparture !== 'departed', nullsFirst: false })
        .order('jm_id', { ascending: true })
        .range(offset, offset + cappedLimit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      return toolResult({
        total: count ?? data?.length ?? 0,
        page: Math.max(1, Number(page) || 1),
        limit: cappedLimit,
        applied_filter: explicitRange
          ? { departure_from: departure_from || null, departure_to: departure_to || null }
          : { departure: effectiveDeparture },
        rows: (await attachPaketNama(supabase, data || []))
          .map((row) => ({ ...row, payment_status: classifyPaymentStatus(row) })),
        note: DATA_NOTE,
      });
    },
  },

  {
    name: 'get_jamaah',
    title: 'Detail jamaah',
    description: 'Detail satu jamaah berdasarkan jm_id (dari list_jamaah), termasuk dokumen, '
      + 'perlengkapan, dan anggota lain dalam booking yang sama. ' + DATA_NOTE,
    parameters: {
      type: 'object',
      properties: {
        jm_id: { type: 'string', minLength: 3, maxLength: 40, description: 'ID jamaah, mis. JM999999990000063643' },
      },
      required: ['jm_id'],
    },
    run: async ({ supabase, agent }, { jm_id } = {}) => {
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

      // attachPaketNama hanya MENAMBAH field, jadi masking & klasifikasi tetap
      // membaca `row` — sumber nilainya sama persis.
      const [withPaket] = await attachPaketNama(supabase, [row]);
      return toolResult({
        jamaah: { ...withPaket, no_paspor: maskPassport(row.no_paspor), payment_status: classifyPaymentStatus(row) },
        booking_members: bookingMembers,
        note: DATA_NOTE,
      });
    },
  },

  {
    name: 'jamaah_birthdays',
    title: 'Ulang tahun jamaah',
    description: 'Jamaah yang berulang tahun dalam N hari ke depan — berguna untuk ucapan/follow-up.',
    parameters: {
      type: 'object',
      properties: {
        within_days: { type: 'string', enum: ['7', '30', '60', '90'], description: 'Default 30' },
      },
      required: [],
    },
    run: async ({ supabase, agent }, { within_days = '30' } = {}) => {
      const today = jakartaToday();
      const { data, error } = await supabase
        .from('jamaah')
        .select('jm_id, nama, wa, tgl_lahir, tgl_berangkat, synced_at')
        .eq('agent_id', agent.id)
        .not('tgl_lahir', 'is', null);
      if (error) throw new Error(error.message);

      const horizon = Number(within_days);
      const matched = (data || [])
        .map((row) => ({ ...row, days_until_birthday: daysUntilNextBirthday(row.tgl_lahir, today) }))
        .filter((row) => row.days_until_birthday !== null && row.days_until_birthday <= horizon)
        .sort((a, b) => a.days_until_birthday - b.days_until_birthday);
      // total = jumlah SEBELUM cap — dulu total dihitung setelah slice sehingga
      // >50 ultah dalam window terpotong diam-diam dan asisten mengira daftarnya
      // lengkap (nikita within_30 = 77, hanya 50 terkirim tanpa sinyal apapun).
      const rows = matched.slice(0, MAX_LIMIT);

      return toolResult({
        today,
        within_days: horizon,
        total: matched.length,
        returned: rows.length,
        rows,
        ...(matched.length > rows.length
          ? { truncated: true, truncated_note: `Hanya ${rows.length} ulang tahun terdekat yang ditampilkan dari ${matched.length} dalam window — persempit within_days untuk sisanya.` }
          : {}),
      });
    },
  },

  {
    name: 'payment_summary',
    title: 'Ringkasan pembayaran',
    description: 'Agregat status pembayaran jamaah dengan keberangkatan mendatang: jumlah pax per '
      + 'bucket (belum_dp/belum_lunas/lunas/lebih_bayar), total outstanding, breakdown per bulan keberangkatan. '
      + 'Pakai group_by="date" untuk breakdown per TANGGAL keberangkatan (menjawab "berapa jamaah berangkat 13 Juni?"); '
      + 'horizon_days membatasi ke N hari ke depan. Outstanding = piutang booking yang sudah mulai bayar '
      + '(belum_dp tidak dihitung sebagai piutang). '
      + DATA_NOTE,
    parameters: {
      type: 'object',
      properties: {
        group_by: {
          type: 'string',
          enum: ['month', 'date'],
          description: 'Granularitas breakdown keberangkatan: month (default) atau date (per-tanggal)',
        },
        horizon_days: {
          type: 'integer',
          minimum: 1,
          maximum: 366,
          description: 'Batasi ke keberangkatan N hari ke depan, mis. 90 untuk fokus tagihan dekat keberangkatan',
        },
      },
      required: [],
    },
    run: async ({ supabase, agent }, { group_by = 'month', horizon_days } = {}) => {
      const today = jakartaToday();
      let q = supabase
        .from('jamaah')
        // Sub-field raw saja (bukan seluruh JSONB) untuk fold shape-aware +
        // price-proof di summarizePayments. Order deterministik: booking yang
        // anggotanya beda tgl_berangkat selalu teratribusi ke tanggal TERAWAL
        // pada group_by=date (firstRow stabil antar-request).
        .select('id_umroh, bayar, sisa, tgl_berangkat, awapi_bayar_sisa:raw_data->>bayar_sisa, awapi_paket_harga:raw_data->>paket_harga, awapi_bayar:raw_data->>bayar')
        .eq('agent_id', agent.id)
        .gte('tgl_berangkat', today)
        .order('tgl_berangkat', { ascending: true })
        .order('jm_id', { ascending: true });
      if (horizon_days) q = q.lte('tgl_berangkat', addDaysISO(today, Number(horizon_days)));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return toolResult({
        as_of: today,
        ...(horizon_days ? { horizon_days: Number(horizon_days) } : {}),
        ...summarizePayments(data || [], { groupBy: group_by }),
        note: DATA_NOTE,
      });
    },
  },

  // ── Data operasional Alhijaz (global — sama untuk semua agent, seperti yang
  // tampil di dashboard & landing page publik) ──

  {
    name: 'list_jadwal_paket',
    title: 'Jadwal paket umroh',
    description: 'Daftar jadwal paket umroh Alhijaz (data global, bukan per-agent): tanggal berangkat/pulang, '
      + 'durasi, maskapai, sisa seat / sold out, harga mulai (tier termurah), jadwal manasik. '
      + 'Gunakan get_jadwal_paket untuk harga lengkap per tipe kamar, hotel, link brosur & itinerary. '
      + GLOBAL_NOTE,
    parameters: {
      type: 'object',
      properties: {
        month: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Filter bulan keberangkatan, format YYYY-MM' },
        search: { type: 'string', maxLength: 80, description: 'Cari di nama paket, mis. "TURKEY" atau "PROMO"' },
        promo_only: { type: 'boolean' },
        available_only: { type: 'boolean', description: 'Hanya paket yang masih ada seat' },
        include_departed: { type: 'boolean', description: 'Sertakan keberangkatan yang sudah lewat (default tidak)' },
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
      },
      required: [],
    },
    run: async ({ supabase }, { month, search, promo_only, available_only, include_departed, page = 1, limit = 20 } = {}) => {
      if (month && !isRealMonth(month)) return toolError('Bulan tidak valid — pakai format YYYY-MM dengan bulan 01-12');
      const today = jakartaToday();
      const FETCH_CAP = 500;
      let q = supabase
        .from('umroh_schedules')
        // brosur_cdn/itinerary_cdn ikut di-select supaya permintaan "minta brosur"
        // selesai dalam SATU panggilan tool. serializeScheduleRows yang mengubahnya
        // jadi URL publik ber-versi (`brosur`, `itinerary`).
        .select('jadwal_id, jadwal_nama, promo, seat_total, seat_sisa, maskapai, berangkat_tgl, berangkat_jam, pulang_tgl, manasik_tgl, manasik_jam, paket_harga, synced_at, brosur_cdn, brosur_source_sha256, itinerary_cdn, itinerary_source_sha256')
        // jadwal_id sebagai tiebreaker — urutan jadwal se-tanggal stabil
        // antar-request sehingga batas halaman tidak menggeser baris.
        .order('berangkat_tgl', { ascending: true })
        .order('jadwal_id', { ascending: true })
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

      const deduped = dedupeJadwalRows(data).filter((row) => hasValidPricing(row.paket_harga));
      // serializeScheduleRows yang tahu cara menyusun URL publik ber-versi dari
      // kolom *_cdn + sha; dipakai lewat peta id supaya ringkasan barisnya tetap
      // ramping (summarizeJadwalRow) tapi link brosur/itinerary tetap terbawa.
      const linkById = new Map(
        serializeScheduleRows(deduped).map((r) => [r.jadwal_id, { brosur: r.brosur || null, itinerary: r.itinerary || null }]),
      );
      let rows = deduped.map((row) => ({ ...summarizeJadwalRow(row), ...(linkById.get(row.jadwal_id) || {}) }));
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
    },
  },

  {
    name: 'get_jadwal_paket',
    title: 'Detail paket umroh',
    description: 'Detail lengkap satu paket by jadwal_id: harga per tier & tipe kamar (paket_harga), hotel Mekkah/Madinah '
      + 'per tier (paket_hotel), rute & jam penerbangan berangkat/pulang, manasik, sisa seat, '
      + 'plus link publik brosur (gambar) dan itinerary (PDF) yang bisa dibuka langsung. ' + GLOBAL_NOTE,
    parameters: {
      type: 'object',
      properties: {
        jadwal_id: { type: 'string', minLength: 2, maxLength: 30, description: 'ID jadwal dari list_jadwal_paket, mis. JBU1484' },
      },
      required: ['jadwal_id'],
    },
    run: async ({ supabase }, { jadwal_id } = {}) => {
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
    },
  },

  {
    name: 'kalkulasi_harga',
    title: 'Kalkulasi harga paket',
    description: 'Hitung total harga satu paket persis seperti tool Kalkulasi di dashboard. '
      + 'Jumlah kamar = jumlah ORANG per tipe kamar (harga per orang). Anak tanpa kasur dihitung dari harga quad '
      + 'dikurangi diskon anak (RAHMAH 5,5jt / PROMO 3jt / lainnya 3,5jt); infant pakai harga Infant paket (fallback 8,5jt). '
      + 'Diskon per-pax tidak menghitung infant.',
    parameters: {
      type: 'object',
      properties: {
        jadwal_id: { type: 'string', minLength: 2, maxLength: 30 },
        tier: { type: 'string', maxLength: 30, description: 'Tier harga, mis. UHUD / RAHMAH — default tier pertama paket' },
        kamar_quad: { type: 'integer', minimum: 0, maximum: 200, description: 'Jumlah orang di kamar quad' },
        kamar_triple: { type: 'integer', minimum: 0, maximum: 200 },
        kamar_double: { type: 'integer', minimum: 0, maximum: 200 },
        kamar_single: { type: 'integer', minimum: 0, maximum: 200 },
        anak_tanpa_kasur: { type: 'integer', minimum: 0, maximum: 50 },
        infant: { type: 'integer', minimum: 0, maximum: 50 },
        diskon_per_pax: { type: 'number', minimum: 0, description: 'Diskon Rupiah per jamaah (infant tidak dihitung)' },
        diskon_flat: { type: 'number', minimum: 0, description: 'Diskon Rupiah total' },
      },
      required: ['jadwal_id'],
    },
    run: async ({ supabase }, args = {}) => {
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
    },
  },

  {
    name: 'calendar_events',
    title: 'Kalender manasik / keberangkatan / kepulangan',
    description: 'Agenda Alhijaz dari kalender internal: manasik, keberangkatan, dan kepulangan per KLOTER — '
      + 'termasuk paket, pesawat, jam, jumlah pax, Tour Leader (TL), mutawif, staff, dan jam/titik kumpul bila ada. '
      + 'Untuk tahu siapa TL atau mutawif sebuah keberangkatan, cari event keberangkatan kloter tersebut. '
      + 'Agent menyebut mutawif dengan macam-macam ejaan (muthowif, mutowif, muthawwif, ustad, ustadz, pembimbing) — '
      + 'semuanya merujuk field `mutawif` di sini. '
      + 'PENTING: pax di sini adalah KUOTA kloter operasional (alokasi kursi nasional, identik seat_total jadwal) — '
      + 'BUKAN jumlah jamaah ter-booking; pax_terisi = kursi terisi nasional (kuota − sisa seat, angka utama dashboard); '
      + 'pax_jamaah = jumlah jamaah ter-booking di seluruh jaringan agent aplikasi ini (keduanya null bila kloter tak '
      + 'ter-map ke jadwal). Untuk jamaah milik agent ini pakai list_jamaah dengan '
      + 'departure_from/departure_to. ' + GLOBAL_NOTE,
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['manasik', 'keberangkatan', 'kepulangan'], description: 'Default semua tipe' },
        from: { type: 'string', pattern: ISO_DATE_PATTERN, description: 'Tanggal mulai, default hari ini' },
        days: { type: 'integer', minimum: 1, maximum: 120, description: 'Rentang hari ke depan (batas akhir inklusif), default 30' },
        search: { type: 'string', maxLength: 80, description: 'Cari di nama paket / nama Tour Leader / nomor kloter' },
      },
      required: [],
    },
    run: async ({ supabase }, { type, from, days = 30, search } = {}) => {
      if (from && !isRealISODate(from)) return toolError('Tanggal "from" tidak valid — pakai format YYYY-MM-DD yang benar');
      const start = from || jakartaToday();
      const end = addDaysISO(start, Math.min(Number(days) || 30, 120));
      const FETCH_CAP = 150;
      let q = supabase
        .from('calendar_events')
        .select('event_date, event_type, group_number, paket, pesawat, jam, pax, pax_jamaah, pax_terisi, tour_leader, staff, jam_kumpul, titik_kumpul, calendar_mutawif:raw_data->>mutawif')
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
        // Kunci "kloter", bukan "grup": model menirukan nama field ke dalam
        // jawabannya, dan istilah yang dipakai agent Alhijaz adalah Kloter.
        // Kolom DB-nya tetap group_number — yang berganti hanya nama keluaran.
        kloter: row.group_number || null,
        // Event manasik menyimpan paket sebagai "DD/MM/YYYYNAMA" (tanggal
        // berangkat kloter menempel) — pisahkan seperti kalender dashboard.
        ...cleanCalendarPaket(row.paket),
        pesawat: row.pesawat || null,
        jam: row.jam || null,
        pax: row.pax ?? null,
        pax_jamaah: row.pax_jamaah ?? null,
        pax_terisi: row.pax_terisi ?? null,
        tour_leader: cleanCalendarPerson(row.tour_leader),
        mutawif: cleanCalendarPerson(row.calendar_mutawif),
        staff: cleanCalendarPerson(row.staff),
        jam_kumpul: row.jam_kumpul || null,
        titik_kumpul: row.titik_kumpul || null,
      }));

      return toolResult({
        from: start, to: end, total: rows.length, rows,
        ...(truncated ? { truncated: true, truncated_note: `Hasil dibatasi ${FETCH_CAP} event teratas — persempit rentang (days) atau pakai filter type/search.` } : {}),
        note: GLOBAL_NOTE,
      });
    },
  },
];

// Lookup by name — mcp-server.js (dan nanti endpoint Bani) mengambil entri
// tanpa menyisir array tiap request.
export const BANI_TOOL_BY_NAME = Object.fromEntries(BANI_TOOLS.map((tool) => [tool.name, tool]));
