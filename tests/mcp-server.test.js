import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateMcpApiKey,
  hashMcpApiKey,
  parseMcpBearer,
  createRateLimiter,
  classifyPaymentStatus,
  summarizePayments,
  daysUntilNextBirthday,
  computeKalkulasi,
  summarizeJadwalRow,
  cleanCalendarPerson,
  cleanCalendarPaket,
  isRealISODate,
  isRealMonth,
  maskPassport,
} from '../mcp-server.js';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

// Body ke-8 handler tool pindah ke lib/bani-tools.js (dipakai bersama asisten
// Bani in-app); mcp-server.js menyisakan auth, rate limit, skema zod, dan
// envelope content MCP. Guard source di bawah menjaga kontrak yang SAMA pada
// permukaan MCP gabungan — pola assertion-nya tidak berubah, hanya sumbernya
// yang kini dua file. Guard read-only per-file tetap dipisah (mcp-server.js di
// bawah, lib/bani-tools.js di tests/bani-tools.test.js).
function readMcpSurface() {
  return `${read('mcp-server.js')}\n${read('lib/bani-tools.js')}`;
}

// ── key format & bearer parsing ──────────────────────────────────────────────

test('generateMcpApiKey produces parseable alhijaz_mcp_ keys', () => {
  const key = generateMcpApiKey();
  // Terminologi user-facing selalu "alhijaz", bukan "miqot" (2026-06-06).
  assert.match(key, /^alhijaz_mcp_[a-f0-9]{48}$/);
  assert.equal(parseMcpBearer(`Bearer ${key}`), key);
  // Two keys must never collide trivially.
  assert.notEqual(generateMcpApiKey(), generateMcpApiKey());
});

test('parseMcpBearer still accepts legacy miqot_mcp_ keys already installed', () => {
  // Key lama yang terlanjur dipasang di asisten agent tidak boleh putus.
  const legacy = `miqot_mcp_${'a'.repeat(48)}`;
  assert.equal(parseMcpBearer(`Bearer ${legacy}`), legacy);
});

test('parseMcpBearer rejects everything that is not a well-formed key', () => {
  assert.equal(parseMcpBearer(undefined), null);
  assert.equal(parseMcpBearer(''), null);
  assert.equal(parseMcpBearer('Bearer '), null);
  assert.equal(parseMcpBearer('Bearer some-jwt-token'), null);
  // JWT must NOT work on the MCP endpoint — it is a separate credential.
  assert.equal(parseMcpBearer('Bearer eyJhbGciOiJIUzI1NiJ9.x.y'), null);
  assert.equal(parseMcpBearer('Bearer alhijaz_mcp_tooshort'), null);
  assert.equal(parseMcpBearer(`alhijaz_mcp_${'a'.repeat(48)}`), null); // missing Bearer
  // Prefix selain alhijaz/miqot ditolak.
  assert.equal(parseMcpBearer(`Bearer umroh_mcp_${'a'.repeat(48)}`), null);
  // Case noise is normalized, value returned lowercase.
  assert.equal(
    parseMcpBearer(`bearer ALHIJAZ_MCP_${'A'.repeat(48)}`),
    `alhijaz_mcp_${'a'.repeat(48)}`,
  );
});

// ── key hashing at rest ─────────────────────────────────────────────────────

test('hashMcpApiKey is a stable, case-insensitive sha256 hex of the token', () => {
  const key = generateMcpApiKey();
  const h = hashMcpApiKey(key);
  assert.match(h, /^[0-9a-f]{64}$/);
  // Deterministic + case-insensitive (parseMcpBearer lowercases bearer tokens).
  assert.equal(hashMcpApiKey(key), h);
  assert.equal(hashMcpApiKey(key.toUpperCase()), h);
  // Different keys → different hashes; the hash is not the key.
  assert.notEqual(hashMcpApiKey(generateMcpApiKey()), h);
  assert.notEqual(h, key);
});

test('legacy miqot_ key hashes the same whether parsed or raw — installed keys survive', () => {
  const legacy = `miqot_mcp_${'a'.repeat(48)}`;
  assert.equal(hashMcpApiKey(parseMcpBearer(`Bearer ${legacy}`)), hashMcpApiKey(legacy));
});

// ── date validation (zod regex guards shape only) ───────────────────────────

test('isRealISODate rejects impossible dates that pass the YYYY-MM-DD regex', () => {
  assert.equal(isRealISODate('2026-06-06'), true);
  assert.equal(isRealISODate('2026-02-29'), false); // not a leap year
  assert.equal(isRealISODate('2024-02-29'), true);  // leap year
  assert.equal(isRealISODate('2026-13-45'), false);
  assert.equal(isRealISODate('2026-00-10'), false);
  assert.equal(isRealISODate('2026-6-6'), false);   // wrong shape
  assert.equal(isRealISODate(''), false);
});

test('isRealMonth rejects out-of-range months that pass the YYYY-MM regex', () => {
  assert.equal(isRealMonth('2026-07'), true);
  assert.equal(isRealMonth('2026-12'), true);
  assert.equal(isRealMonth('2026-00'), false);
  assert.equal(isRealMonth('2026-13'), false);
  assert.equal(isRealMonth('2026-99'), false);
});

// ── passport masking ────────────────────────────────────────────────────────

test('maskPassport exposes only the last 4 chars', () => {
  assert.equal(maskPassport('X9417633'), '••••7633');
  assert.equal(maskPassport('AB12'), '••••');
  assert.equal(maskPassport(''), '');
  assert.equal(maskPassport(null), '');
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
  assert.equal(classifyPaymentStatus({ bayar: 5000000, sisa: 28900000 }), 'belum_lunas');
  assert.equal(classifyPaymentStatus({ bayar: 33900000, sisa: 0 }), 'lunas');
  assert.equal(classifyPaymentStatus({ bayar: 47800000, sisa: -13900000 }), 'lebih_bayar');
  // Dashboard semantics (server.js payment_status switch): sisa menentukan
  // bucket TERLEPAS dari bayar — sisa null/0 = lunas, sisa<0 = lebih_bayar.
  assert.equal(classifyPaymentStatus({ bayar: 0, sisa: 0 }), 'lunas');
  assert.equal(classifyPaymentStatus({ bayar: null, sisa: null }), 'lunas');
  assert.equal(classifyPaymentStatus({ bayar: 0, sisa: -100 }), 'lebih_bayar');
});

test('summarizePayments aggregates buckets and departure months', () => {
  const summary = summarizePayments([
    { id_umroh: 'AIW1', bayar: 0, sisa: 5000000, tgl_berangkat: '2026-07-04' },
    { id_umroh: 'AIW2', bayar: 5000000, sisa: 28900000, tgl_berangkat: '2026-07-04' },
    { id_umroh: 'AIW3', bayar: 34900000, sisa: 0, tgl_berangkat: '2026-07-18' },
    { id_umroh: 'AIW4', bayar: 36400000, sisa: 10500000, tgl_berangkat: '2026-09-19' },
    { id_umroh: 'AIW5', bayar: 36400000, sisa: 10500000, tgl_berangkat: '2026-09-19' },
  ]);

  assert.equal(summary.total_pax, 5);
  assert.equal(summary.belum_dp, 1);
  assert.equal(summary.belum_lunas, 3);
  assert.equal(summary.lunas, 1);
  // Outstanding ikut aturan dashboard: hanya booking dengan bayar>0 (belum_dp
  // AIW1 tidak dihitung), masing-masing booking sekali.
  assert.equal(summary.total_outstanding, 28900000 + 10500000 * 2);
  assert.equal(summary.by_departure_month['2026-07'].pax, 3);
  assert.equal(summary.by_departure_month['2026-09'].outstanding, 21000000);
});

test('summarizePayments sums per-pax sisa per booking (notifier semantics, AIW0029174)', () => {
  // Shape per-pax (raw bayar_sisa >= 0/absen): tiap row membawa sisa pax itu
  // sendiri — outstanding booking = Σ sisa, BUKAN dedupe per id_umroh ala
  // stats dashboard pra-insiden (yang menampilkan booking 3 pax owing 84,7jt
  // sebagai 28,3jt — lihat collapsePelunasanBookings di telegram-notifier.js).
  const summary = summarizePayments([
    { id_umroh: 'AIW0029174', bayar: 16600000, sisa: 28300000, tgl_berangkat: '2026-07-11' },
    { id_umroh: 'AIW0029174', bayar: 16800000, sisa: 28100000, tgl_berangkat: '2026-07-11' },
    { id_umroh: 'AIW0029174', bayar: 16600000, sisa: 28300000, tgl_berangkat: '2026-07-11' },
    { id_umroh: 'AIW0029001', bayar: 5000000, sisa: 7000000, tgl_berangkat: '2026-07-11' },
  ]);
  assert.equal(summary.total_pax, 4);
  assert.equal(summary.belum_lunas, 4);
  assert.equal(summary.total_outstanding, 28300000 + 28100000 + 28300000 + 7000000);
  assert.equal(summary.by_departure_month['2026-07'].outstanding, summary.total_outstanding);
});

test('summarizePayments falls back to max sisa for aggregate-shape bookings', () => {
  // Shape aggregate (raw bayar_sisa < 0): `bayar` adalah total booking yang
  // direplikasi per row dan sisa DB stale — Σ sisa akan menggandakan; pakai
  // max(sisa) persis fallback konservatif notifier.
  const summary = summarizePayments([
    { id_umroh: 'AIW0027949', bayar: 72800000, sisa: 21000000, awapi_bayar_sisa: -39000000, tgl_berangkat: '2026-09-19' },
    { id_umroh: 'AIW0027949', bayar: 72800000, sisa: 21000000, awapi_bayar_sisa: -39000000, tgl_berangkat: '2026-09-19' },
  ]);
  assert.equal(summary.total_outstanding, 21000000); // bukan 42jt
  assert.equal(summary.by_departure_month['2026-09'].outstanding, 21000000);
});

test('summarizePayments excludes belum_dp rows from outstanding (pax count only)', () => {
  const summary = summarizePayments([
    { id_umroh: 'A', bayar: 0, sisa: 35000000, tgl_berangkat: '2026-08-01' },
    { id_umroh: 'B', bayar: 5000000, sisa: 1000000, tgl_berangkat: '2026-08-01' },
  ]);
  assert.equal(summary.belum_dp, 1);
  assert.equal(summary.total_outstanding, 1000000);
});

test('summarizePayments groupBy date keys the breakdown per departure date', () => {
  const summary = summarizePayments([
    { id_umroh: 'A', bayar: 1, sisa: 0, tgl_berangkat: '2026-06-13' },
    { id_umroh: 'B', bayar: 1, sisa: 0, tgl_berangkat: '2026-06-13' },
    { id_umroh: 'C', bayar: 0, sisa: 100, tgl_berangkat: '2026-06-20' },
  ], { groupBy: 'date' });
  assert.equal(summary.by_departure_date['2026-06-13'].pax, 2);
  assert.equal(summary.by_departure_date['2026-06-20'].belum_dp, 1);
  assert.equal(summary.by_departure_month, undefined);
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

test('cleanCalendarPaket splits the legacy manasik date prefix like the dashboard', () => {
  // Mirror parsePaket di src/components/UpcomingSchedule.tsx — nama paket yang
  // dilihat asisten AI harus sama dengan yang tampil di kalender dashboard.
  assert.deepEqual(
    cleanCalendarPaket('20/06/2026PROMO PLUS DUBAI + TAIF 11HR'),
    { paket: 'PROMO PLUS DUBAI + TAIF 11HR', kloter_berangkat_tgl: '2026-06-20' },
  );
  // Tanpa prefix (keberangkatan/kepulangan) lewat apa adanya.
  assert.deepEqual(
    cleanCalendarPaket('REGULER MIX PAKET RAHMAH & UHUD 9HR'),
    { paket: 'REGULER MIX PAKET RAHMAH & UHUD 9HR', kloter_berangkat_tgl: null },
  );
  // Bulan mustahil → jangan dikira prefix tanggal.
  assert.deepEqual(
    cleanCalendarPaket('20/13/2026PAKET ANEH'),
    { paket: '20/13/2026PAKET ANEH', kloter_berangkat_tgl: null },
  );
  assert.deepEqual(cleanCalendarPaket(null), { paket: null, kloter_berangkat_tgl: null });
  assert.deepEqual(cleanCalendarPaket(''), { paket: null, kloter_berangkat_tgl: null });
});

// ── source contracts ──────────────────────────────────────────────────────────

test('mcp-server.js is strictly read-only against the database', () => {
  const src = read('mcp-server.js');
  assert.doesNotMatch(src, /\.insert\(/);
  // Supabase writes are `.update({...})` — crypto's `hash.update(str)` (key
  // hashing) takes a string and must not trip this.
  assert.doesNotMatch(src, /\.update\(\{/);
  assert.doesNotMatch(src, /\.upsert\(/);
  // Supabase delete is argless `.delete()` — `app.delete('/mcp', ...)` (the 405
  // route) is fine and must not trip this.
  assert.doesNotMatch(src, /\.delete\(\)/);
  assert.doesNotMatch(src, /\.rpc\(/);
});

test('keys are stored hashed, looked up hashed, and never persisted raw', () => {
  const server = read('server.js');
  const mcp = read('mcp-server.js');
  // All four key-storage sites store the HASH, never the raw key.
  assert.match(server, /mcp_api_key: hashMcpApiKey\(key\)/);
  assert.doesNotMatch(server, /mcp_api_key: key\b/);
  // Lookup is by hash of the incoming token.
  assert.match(mcp, /const keyHash = hashMcpApiKey\(token\)/);
  assert.match(mcp, /\.eq\('mcp_api_key', keyHash\)/);
});

test('/mcp has a per-IP rate limit applied before token resolution', () => {
  const mcp = read('mcp-server.js');
  assert.match(mcp, /IP_RATE_LIMIT_PER_MINUTE/);
  // ipLimiter check must precede parseMcpBearer in the handler.
  assert.match(mcp, /ipLimiter\(clientIp\)[\s\S]{0,800}parseMcpBearer\(req\.headers\.authorization\)/);
  assert.match(mcp, /x-real-ip/);
});

test('client-facing errors are generic; raw DB messages are not forwarded', () => {
  const mcp = read('mcp-server.js');
  // Tool catch returns a generic message, not err.message.
  assert.match(mcp, /catch \(err\)[\s\S]{0,400}toolError\('Terjadi kesalahan internal/);
  assert.doesNotMatch(mcp, /return toolError\(err\.message\)/);
  // REST mcp-key endpoints (scoped slice) return a generic error, not error.message.
  const server = read('server.js');
  const mcpBlock = server.slice(server.indexOf("app.post('/api/admin/agents/:slug/mcp-key'"), server.indexOf('// CAPI: Meta Conversion API routes'));
  assert.ok(mcpBlock.length > 0, 'mcp-key block located');
  assert.doesNotMatch(mcpBlock, /json\(\{ error: error\.message \}\)/);
  assert.match(mcpBlock, /Gagal membuat kunci/);
});

test('/mcp body is capped tight, separate from the global 10mb parser', () => {
  const server = read('server.js');
  assert.match(server, /app\.use\('\/mcp', express\.json\(\{ limit: '128kb' \}\)\)/);
});

test('impossible dates are rejected before hitting Postgres', () => {
  const mcp = readMcpSurface();
  assert.match(mcp, /if \(from && !isRealISODate\(from\)\) return toolError/);
  assert.match(mcp, /if \(month && !isRealMonth\(month\)\) return toolError/);
});

test('passport number is masked in get_jamaah output', () => {
  const mcp = readMcpSurface();
  assert.match(mcp, /no_paspor: maskPassport\(row\.no_paspor\)/);
});

test('tool-call logging records param keys only, never values (no PII in logs)', () => {
  const mcp = read('mcp-server.js');
  assert.match(mcp, /Object\.keys\(args \|\| \{\}\)\.join/);
  assert.doesNotMatch(mcp, /\$\{name\} \$\{JSON\.stringify\(args\)\}/);
});

test('jadwal/kalkulasi/calendar tools are registered against the cache tables', () => {
  const src = readMcpSurface();
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

test('list_jamaah exposes exact departure-date filtering (akar kasus "OpenClaw bilang 0")', () => {
  const src = readMcpSurface();
  // departure_from/departure_to harus terdaftar di inputSchema dan tervalidasi
  // sebagai tanggal kalender nyata sebelum menyentuh Postgres.
  assert.match(src, /departure_from: z\.string\(\)\.regex/);
  assert.match(src, /departure_to: z\.string\(\)\.regex/);
  assert.match(src, /if \(departure_from && !isRealISODate\(departure_from\)\) return toolError/);
  assert.match(src, /if \(departure_to && !isRealISODate\(departure_to\)\) return toolError/);
  // Search tanpa departure eksplisit mencakup SEMUA jamaah (bukan upcoming
  // saja) — lookup nama jamaah yang sudah berangkat tidak boleh "0" menyesatkan.
  assert.match(src, /departure \|\| \(term \? 'all' : 'all_upcoming'\)/);
});

test('paginated jamaah/jadwal queries have a deterministic tiebreaker order', () => {
  const src = readMcpSurface();
  // Banyak baris berbagi tanggal yang sama — tanpa secondary sort, paginasi
  // bisa duplikat/skip baris pada batas halaman antar-request.
  assert.match(src, /\.order\('tgl_berangkat'[\s\S]{0,120}\.order\('jm_id'/);
  assert.match(src, /\.order\('berangkat_tgl'[\s\S]{0,160}\.order\('jadwal_id'/);
});

test('jamaah_birthdays reports the true pre-cap total and a truncation flag', () => {
  const src = readMcpSurface();
  // total dihitung SEBELUM slice(0, MAX_LIMIT); >50 match harus bersinyal
  // truncated, bukan terpotong diam-diam.
  assert.match(src, /total: matched\.length/);
  assert.match(src, /matched\.slice\(0, MAX_LIMIT\)/);
  assert.match(src, /matched\.length > rows\.length[\s\S]{0,120}truncated: true/);
});

test('payment_summary supports per-date breakdown and notifier outstanding semantics', () => {
  const src = readMcpSurface();
  assert.match(src, /z\.enum\(\['month', 'date'\]\)/);
  // Deteksi shape aggregate + price-proof butuh sub-field raw saja, bukan
  // seluruh raw_data (JSONB besar, DB sensitif IO).
  assert.match(src, /awapi_bayar_sisa:raw_data->>bayar_sisa/);
  assert.match(src, /awapi_paket_harga:raw_data->>paket_harga/);
  assert.doesNotMatch(src, /select\('[^']*raw_data[,)' ]/, 'never select the whole raw_data JSONB');
  // Fold booking dipakai dari lib bersama (juga dipakai stats dashboard), dan
  // query-nya ber-order deterministik agar atribusi tanggal stabil.
  assert.match(src, /collapseBookingOutstanding/);
  assert.match(src, /gte\('tgl_berangkat', today\)\s*\n\s*\.order\('tgl_berangkat'/);
});

test('auth and rate-limit rejections are logged for diagnosability (no raw token)', () => {
  const src = read('mcp-server.js');
  assert.match(src, /reject 429 per-IP/);
  assert.match(src, /reject 401 missing\/malformed bearer/);
  assert.match(src, /reject 429 per-key/);
  assert.match(src, /reject 401 unknown\/inactive/);
  // Korelasi pakai potongan hash, token mentah tidak pernah masuk log.
  assert.match(src, /hashMcpApiKey\(token\)\.slice\(0, 8\)/);
  assert.doesNotMatch(src, /log\(`?\[MCP\][^`]*\$\{token\}/);
});

test('every MCP jamaah query is scoped to the authenticated agent', () => {
  const src = readMcpSurface();
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
  assert.match(layout, /const McpIntegrationPage = lazy\(\(\) => import\('\.\/McpIntegrationPage'\)\)/);
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
