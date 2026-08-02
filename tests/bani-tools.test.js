import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BANI_TOOLS, BANI_TOOL_BY_NAME, MAX_LIMIT } from '../lib/bani-tools.js';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

// Kontrak registry: dua permukaan (MCP eksternal per-agent + asisten Bani
// in-app) memakai daftar tool yang SAMA. Menambah/menghapus tool di sini harus
// disengaja, bukan efek samping refactor.
const EXPECTED_TOOLS = [
  'list_jamaah',
  'get_jamaah',
  'jamaah_birthdays',
  'payment_summary',
  'list_jadwal_paket',
  'get_jadwal_paket',
  'kalkulasi_harga',
  'calendar_events',
];

// ── bentuk registry ──────────────────────────────────────────────────────────

test('BANI_TOOLS berisi tepat 8 tool dengan nama unik sesuai daftar', () => {
  assert.equal(BANI_TOOLS.length, 8);
  const names = BANI_TOOLS.map((t) => t.name);
  assert.deepEqual(names, EXPECTED_TOOLS);
  assert.equal(new Set(names).size, names.length, 'nama tool harus unik');
  // Lookup by-name mencakup semuanya (dipakai mcp-server.js per request).
  assert.deepEqual(Object.keys(BANI_TOOL_BY_NAME).sort(), [...names].sort());
  for (const name of names) assert.equal(BANI_TOOL_BY_NAME[name].name, name);
});

test('setiap tool punya description, JSON Schema object, dan run() async', () => {
  for (const tool of BANI_TOOLS) {
    assert.ok(typeof tool.description === 'string' && tool.description.trim().length > 0, `${tool.name}: description kosong`);
    assert.ok(typeof tool.title === 'string' && tool.title.trim().length > 0, `${tool.name}: title kosong`);
    assert.equal(typeof tool.parameters, 'object', `${tool.name}: parameters bukan objek`);
    assert.equal(tool.parameters.type, 'object', `${tool.name}: parameters.type harus 'object'`);
    assert.equal(typeof tool.parameters.properties, 'object', `${tool.name}: parameters.properties wajib ada`);
    assert.ok(Array.isArray(tool.parameters.required), `${tool.name}: parameters.required wajib array`);
    assert.equal(typeof tool.run, 'function', `${tool.name}: run bukan function`);
  }
});

test('parameters JSON Schema konsisten — required merujuk properti yang dideklarasikan', () => {
  for (const tool of BANI_TOOLS) {
    const props = Object.keys(tool.parameters.properties);
    assert.ok(props.length > 0, `${tool.name}: properties kosong`);
    for (const req of tool.parameters.required) {
      assert.ok(props.includes(req), `${tool.name}: required '${req}' tidak ada di properties`);
    }
    for (const [key, schema] of Object.entries(tool.parameters.properties)) {
      assert.ok(
        ['string', 'integer', 'number', 'boolean'].includes(schema.type),
        `${tool.name}.${key}: tipe JSON Schema tidak dikenal (${schema.type})`,
      );
      if (schema.enum) assert.ok(Array.isArray(schema.enum) && schema.enum.length > 0, `${tool.name}.${key}: enum kosong`);
    }
  }
});

test('lookup by-id butuh identitasnya — jm_id/jadwal_id wajib', () => {
  assert.deepEqual(BANI_TOOL_BY_NAME.get_jamaah.parameters.required, ['jm_id']);
  assert.deepEqual(BANI_TOOL_BY_NAME.get_jadwal_paket.parameters.required, ['jadwal_id']);
  assert.deepEqual(BANI_TOOL_BY_NAME.kalkulasi_harga.parameters.required, ['jadwal_id']);
  // Tool daftar tidak boleh mewajibkan apa-apa (dipanggil tanpa argumen).
  for (const name of ['list_jamaah', 'jamaah_birthdays', 'payment_summary', 'list_jadwal_paket', 'calendar_events']) {
    assert.deepEqual(BANI_TOOL_BY_NAME[name].parameters.required, [], `${name} tidak boleh punya required`);
  }
  // Plafon paginasi diiklankan ke model, bukan cuma dipaksa diam-diam.
  assert.equal(BANI_TOOL_BY_NAME.list_jamaah.parameters.properties.limit.maximum, MAX_LIMIT);
  assert.equal(BANI_TOOL_BY_NAME.list_jadwal_paket.parameters.properties.limit.maximum, MAX_LIMIT);
});

// ── handler: bentuk hasil netral { ok, data|error } ──────────────────────────

// Stub PostgREST: setiap method chain mencatat panggilannya lalu mengembalikan
// dirinya sendiri; hasil di-resolve saat query di-await (thenable).
function stubSupabase(result) {
  const calls = [];
  const chain = {};
  for (const method of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'ilike', 'order', 'range', 'limit']) {
    chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
  }
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return {
    calls,
    from(table) { calls.push(['from', table]); return chain; },
  };
}

const PAKET_HARGA = {
  UHUD: { Quard: '33900000', Triple: '35900000', Double: '38900000', Single: '0', Infant: '9000000' },
};

const DEPS = (supabase) => ({ supabase, agent: { id: 'agent-1', slug: 'nikita' }, log: () => {} });

test('list_jadwal_paket mengembalikan { ok:true, data:{ rows, total, ... } }', async () => {
  const supabase = stubSupabase({
    data: [
      { jadwal_id: 'JBU1484', jadwal_nama: 'REGULER UHUD 9HR', promo: '0', seat_total: '45', seat_sisa: '12', berangkat_tgl: '2026-09-19', pulang_tgl: '2026-09-27', paket_harga: PAKET_HARGA, synced_at: '2026-08-01T00:00:00Z' },
      { jadwal_id: 'JBU1500', jadwal_nama: 'PROMO PLUS DUBAI 11HR', promo: '1', seat_total: '45', seat_sisa: '0', berangkat_tgl: '2026-10-02', pulang_tgl: '2026-10-12', paket_harga: PAKET_HARGA, synced_at: '2026-08-01T00:00:00Z' },
      // Tanpa harga valid → disaring hasValidPricing, tidak pernah sampai model.
      { jadwal_id: 'JBU9999', jadwal_nama: 'TANPA HARGA', paket_harga: {}, berangkat_tgl: '2026-10-05', synced_at: '2026-08-01T00:00:00Z' },
    ],
    error: null,
  });

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {});
  assert.equal(out.ok, true);
  assert.equal(out.error, undefined);
  assert.equal(out.data.total, 2);
  assert.equal(out.data.page, 1);
  assert.equal(out.data.limit, 20);
  assert.deepEqual(out.data.rows.map((r) => r.jadwal_id), ['JBU1484', 'JBU1500']);
  assert.equal(out.data.rows[0].harga_mulai, 33900000);
  assert.equal(out.data.rows[1].sold_out, true);
  assert.ok(out.data.note.includes('global'));
  assert.equal(supabase.calls[0][0], 'from');
  assert.equal(supabase.calls[0][1], 'umroh_schedules');
});

test('list_jadwal_paket available_only membuang paket sold out', async () => {
  const supabase = stubSupabase({
    data: [
      { jadwal_id: 'A', jadwal_nama: 'ADA SEAT', seat_sisa: '5', berangkat_tgl: '2026-09-19', paket_harga: PAKET_HARGA },
      { jadwal_id: 'B', jadwal_nama: 'HABIS', seat_sisa: '0', berangkat_tgl: '2026-09-20', paket_harga: PAKET_HARGA },
    ],
    error: null,
  });
  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), { available_only: true });
  assert.equal(out.ok, true);
  assert.deepEqual(out.data.rows.map((r) => r.jadwal_id), ['A']);
});

test('bulan mustahil ditolak sebagai { ok:false, error } sebelum menyentuh Postgres', async () => {
  const supabase = stubSupabase({ data: [], error: null });
  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), { month: '2026-13' });
  assert.equal(out.ok, false);
  assert.match(out.error, /Bulan tidak valid/);
  assert.equal(supabase.calls.length, 0, 'query tidak boleh dijalankan untuk bulan mustahil');
});

test('tanggal mustahil di list_jamaah ditolak sebelum query', async () => {
  const supabase = stubSupabase({ data: [], error: null, count: 0 });
  const out = await BANI_TOOL_BY_NAME.list_jamaah.run(DEPS(supabase), { departure_from: '2026-02-29' });
  assert.equal(out.ok, false);
  assert.match(out.error, /departure_from tidak valid/);
  assert.equal(supabase.calls.length, 0);
});

test('list_jamaah ter-scope ke agent dan melabeli payment_status tiap baris', async () => {
  const supabase = stubSupabase({
    data: [
      { jm_id: 'JM1', nama: 'A', bayar: 0, sisa: 35000000, tgl_berangkat: '2026-09-19' },
      { jm_id: 'JM2', nama: 'B', bayar: 5000000, sisa: 30000000, tgl_berangkat: '2026-09-19' },
      { jm_id: 'JM3', nama: 'C', bayar: 35000000, sisa: 0, tgl_berangkat: '2026-09-19' },
    ],
    error: null,
    count: 3,
  });
  const out = await BANI_TOOL_BY_NAME.list_jamaah.run(DEPS(supabase), {});
  assert.equal(out.ok, true);
  assert.equal(out.data.total, 3);
  assert.deepEqual(out.data.rows.map((r) => r.payment_status), ['belum_dp', 'belum_lunas', 'lunas']);
  // Isolasi per-agent: filter agent_id wajib ikut di setiap query jamaah.
  assert.ok(
    supabase.calls.some(([m, col, val]) => m === 'eq' && col === 'agent_id' && val === 'agent-1'),
    'query jamaah harus ter-scope agent_id',
  );
  // Default tanpa search = keberangkatan mendatang.
  assert.deepEqual(out.data.applied_filter, { departure: 'all_upcoming' });
});

test('get_jamaah memasking nomor paspor dan melaporkan tidak ditemukan sebagai ok:false', async () => {
  const found = stubSupabase({
    data: [{ jm_id: 'JM1', id_umroh: null, nama: 'A', no_paspor: 'X9417633', bayar: 1, sisa: 0 }],
    error: null,
  });
  const out = await BANI_TOOL_BY_NAME.get_jamaah.run(DEPS(found), { jm_id: 'JM1' });
  assert.equal(out.ok, true);
  assert.equal(out.data.jamaah.no_paspor, '••••7633');

  const missing = stubSupabase({ data: [], error: null });
  const none = await BANI_TOOL_BY_NAME.get_jamaah.run(DEPS(missing), { jm_id: 'JM404' });
  assert.equal(none.ok, false);
  assert.match(none.error, /tidak ditemukan/);
});

test('error DB dilempar (bukan { ok:false }) supaya pemanggil memakai pesan generiknya', async () => {
  const supabase = stubSupabase({ data: null, error: { message: 'relation "jamaah" does not exist' } });
  await assert.rejects(
    () => BANI_TOOL_BY_NAME.list_jamaah.run(DEPS(supabase), {}),
    /relation "jamaah" does not exist/,
  );
});

// ── source contracts ─────────────────────────────────────────────────────────

// Cerminan guard "mcp-server.js is strictly read-only against the database":
// registry ini dipakai asisten AI, jadi tidak boleh ada jalur tulis sama sekali.
test('lib/bani-tools.js is strictly read-only against the database', () => {
  const src = read('lib/bani-tools.js');
  assert.doesNotMatch(src, /\.insert\(/);
  assert.doesNotMatch(src, /\.update\(\{/);
  assert.doesNotMatch(src, /\.upsert\(/);
  assert.doesNotMatch(src, /\.delete\(\)/);
  assert.doesNotMatch(src, /\.rpc\(/);
});

test('registry tidak menembak API upstream — hanya tabel cache lokal', () => {
  const src = read('lib/bani-tools.js');
  assert.match(src, /\.from\('jamaah'\)/);
  assert.match(src, /\.from\('umroh_schedules'\)/);
  assert.match(src, /\.from\('calendar_events'\)/);
  assert.doesNotMatch(src, /awapiFetch/);
  assert.doesNotMatch(src, /fetch\(/);
});

test('mcp-server.js memakai registry, tidak menyalin ulang handler-nya', () => {
  const mcp = read('mcp-server.js');
  assert.match(mcp, /import \{ BANI_TOOL_BY_NAME, MAX_LIMIT \} from '\.\/lib\/bani-tools\.js'/);
  for (const name of EXPECTED_TOOLS) {
    assert.match(mcp, new RegExp(`TOOL\\.${name}\\.run\\(deps, args\\)`), `${name} harus dipanggil dari registry`);
  }
  // Query & bentuk hasil tidak boleh hidup dua kali.
  assert.doesNotMatch(mcp, /\.from\('jamaah'\)/);
  assert.doesNotMatch(mcp, /\.from\('umroh_schedules'\)/);
  assert.doesNotMatch(mcp, /\.from\('calendar_events'\)/);
});
