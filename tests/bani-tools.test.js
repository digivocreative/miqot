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
      if (schema.type === 'array') {
        assert.equal(schema.items?.type, 'string', `${tool.name}.${key}: array hanya boleh berisi string`);
        continue;
      }
      if (schema.type === 'object') {
        assert.equal(typeof schema.properties, 'object', `${tool.name}.${key}: object wajib punya properties`);
        assert.ok(Array.isArray(schema.required), `${tool.name}.${key}: object wajib punya required`);
        continue;
      }
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
  let currentTable = null;
  for (const method of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'ilike', 'in', 'order', 'range', 'limit']) {
    chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
  }
  chain.then = (resolve, reject) => Promise.resolve(
    typeof result === 'function'
      ? result(calls, currentTable)
      : currentTable === 'itineraries' ? { data: [], error: null } : result,
  ).then(resolve, reject);
  return {
    calls,
    from(table) { currentTable = table; calls.push(['from', table]); return chain; },
  };
}

// Simulasi kecil untuk operator filter yang dipakai list_jadwal_paket. Unit
// test tetap memeriksa query yang dibangun, sambil membuktikan baris batas yang
// akan lolos/gugur ketika PostgREST menerapkannya.
function filteringScheduleSupabase(rows, itineraryRows = []) {
  return stubSupabase((calls, table) => {
    if (table === 'itineraries') {
      const requestedIds = [...calls].reverse().find(([method, column]) => method === 'in' && column === 'jadwal_id')?.[2] || [];
      return {
        data: itineraryRows.filter((row) => requestedIds.includes(row.jadwal_id)),
        error: null,
      };
    }
    let filtered = [...rows];
    for (const [method, column, value] of calls) {
      if (method === 'gte') filtered = filtered.filter((row) => String(row[column] || '') >= String(value));
      else if (method === 'lte') filtered = filtered.filter((row) => String(row[column] || '') <= String(value));
      else if (method === 'lt') filtered = filtered.filter((row) => String(row[column] || '') < String(value));
      else if (method === 'ilike') {
        const term = String(value).replace(/^\*|\*$/g, '').toLowerCase();
        filtered = filtered.filter((row) => String(row[column] || '').toLowerCase().includes(term));
      } else if (method === 'or') {
        const terms = String(column).split(',').map((filter) => {
          const match = /^jadwal_nama\.ilike\.\*(.*)\*$/.exec(filter);
          return match ? match[1].toLowerCase() : '';
        }).filter(Boolean);
        filtered = filtered.filter((row) => terms.some(
          (term) => String(row.jadwal_nama || '').toLowerCase().includes(term),
        ));
      }
    }
    return { data: filtered, error: null };
  });
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
  assert.ok(out.data.rows.every((row) => Array.isArray(row.tur) && row.tur.length === 0));
  assert.ok(out.data.rows.every((row) => row.itinerary_tersedia === false));
  assert.ok(out.data.note.includes('global'));
  assert.equal(supabase.calls[0][0], 'from');
  assert.equal(supabase.calls[0][1], 'umroh_schedules');
});

test('list_jadwal_paket tidak mengekspos brosur CDN dari hash sumber lama', async () => {
  const supabase = stubSupabase({
    data: [{
      jadwal_id: 'JBU1589',
      jadwal_nama: 'UMRAH EKONOMIS PLUS AL ULA 9HR',
      seat_sisa: '10',
      berangkat_tgl: '2026-10-10',
      pulang_tgl: '2026-10-18',
      paket_harga: PAKET_HARGA,
      brosur: 'https://origin/brosur-terbaru.webp',
      brosur_cdn: 'https://cdn/brosur/JBU1589-aaaaaaaaaaaaaaaa.webp',
      brosur_source_sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }],
    error: null,
  });

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {});
  assert.equal(out.ok, true);
  assert.equal(out.data.rows[0].brosur, 'https://origin/brosur-terbaru.webp');
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

test('list_jadwal_paket mengekspos schema rentang, covers_date, dan search_any', () => {
  const tool = BANI_TOOL_BY_NAME.list_jadwal_paket;
  for (const key of ['berangkat_from', 'berangkat_to', 'covers_date']) {
    assert.equal(tool.parameters.properties[key].pattern, '^\\d{4}-\\d{2}-\\d{2}$');
  }
  assert.deepEqual(tool.parameters.properties.search_any.items, { type: 'string', maxLength: 40 });
  assert.equal(tool.parameters.properties.search_any.maxItems, 5);
  assert.ok(tool.parameters.properties.tur.enum.includes('Tur Turki'));
  assert.deepEqual(tool.parameters.properties.kota_pada_tanggal.required, ['tanggal', 'kota']);
  assert.deepEqual(tool.parameters.properties.kota_pada_tanggal.properties.kota.enum, ['mekkah', 'madinah']);
  assert.match(tool.description, /tahun baru.*covers_date/);
  assert.match(tool.description, /berangkat_from\/berangkat_to/);
  assert.match(tool.description, /search_any/);
  assert.match(tool.description, /kota_pada_tanggal/);
});

test('list_jadwal_paket covers_date menangkap hanya paket yang sedang berjalan', async () => {
  const supabase = filteringScheduleSupabase([
    { jadwal_id: 'TAHUN-BARU', jadwal_nama: 'UMRAH TAHUN BARU', berangkat_tgl: '2026-12-27', pulang_tgl: '2027-01-05', paket_harga: PAKET_HARGA },
    { jadwal_id: 'SUDAH-PULANG', jadwal_nama: 'UMRAH DESEMBER', berangkat_tgl: '2026-12-20', pulang_tgl: '2026-12-30', paket_harga: PAKET_HARGA },
    { jadwal_id: 'BELUM-BERANGKAT', jadwal_nama: 'UMRAH JANUARI', berangkat_tgl: '2027-01-02', pulang_tgl: '2027-01-10', paket_harga: PAKET_HARGA },
  ]);

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), { covers_date: '2027-01-01' });

  assert.equal(out.ok, true);
  assert.deepEqual(out.data.rows.map((row) => row.jadwal_id), ['TAHUN-BARU']);
  assert.ok(supabase.calls.some(([method, column, value]) => method === 'lte' && column === 'berangkat_tgl' && value === '2027-01-01'));
  assert.ok(supabase.calls.some(([method, column, value]) => method === 'gte' && column === 'pulang_tgl' && value === '2027-01-01'));
  assert.equal(
    supabase.calls.some(([method, column]) => method === 'gte' && column === 'berangkat_tgl'),
    false,
    'covers_date tidak boleh ditimpa guard upcoming bawaan',
  );
});

test('list_jadwal_paket berangkat_from/to inklusif di kedua ujung', async () => {
  const supabase = filteringScheduleSupabase([
    { jadwal_id: 'SEBELUM', jadwal_nama: 'SEBELUM', berangkat_tgl: '2026-12-26', pulang_tgl: '2027-01-03', paket_harga: PAKET_HARGA },
    { jadwal_id: 'BATAS-AWAL', jadwal_nama: 'BATAS AWAL', berangkat_tgl: '2026-12-27', pulang_tgl: '2027-01-04', paket_harga: PAKET_HARGA },
    { jadwal_id: 'BATAS-AKHIR', jadwal_nama: 'BATAS AKHIR', berangkat_tgl: '2027-01-05', pulang_tgl: '2027-01-13', paket_harga: PAKET_HARGA },
    { jadwal_id: 'SESUDAH', jadwal_nama: 'SESUDAH', berangkat_tgl: '2027-01-06', pulang_tgl: '2027-01-14', paket_harga: PAKET_HARGA },
  ]);

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    berangkat_from: '2026-12-27',
    berangkat_to: '2027-01-05',
  });

  assert.deepEqual(out.data.rows.map((row) => row.jadwal_id), ['BATAS-AWAL', 'BATAS-AKHIR']);
});

test('list_jadwal_paket month menang atas rentang dan menambahkan note', async () => {
  const supabase = filteringScheduleSupabase([
    { jadwal_id: 'DESEMBER', jadwal_nama: 'DESEMBER', berangkat_tgl: '2026-12-20', pulang_tgl: '2026-12-28', paket_harga: PAKET_HARGA },
    { jadwal_id: 'JANUARI', jadwal_nama: 'JANUARI', berangkat_tgl: '2027-01-02', pulang_tgl: '2027-01-10', paket_harga: PAKET_HARGA },
  ]);

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    month: '2026-12',
    berangkat_from: '2027-01-01',
  });

  assert.equal(out.ok, true);
  assert.deepEqual(out.data.rows.map((row) => row.jadwal_id), ['DESEMBER']);
  assert.match(out.data.note, /berangkat_from\/berangkat_to diabaikan karena month menang/);
});

test('list_jadwal_paket search_any memakai OR untuk beberapa ejaan', async () => {
  const supabase = filteringScheduleSupabase([
    { jadwal_id: 'A', jadwal_nama: 'UMRAH PLUS TURKI', berangkat_tgl: '2027-01-02', pulang_tgl: '2027-01-10', paket_harga: PAKET_HARGA },
    { jadwal_id: 'B', jadwal_nama: 'UMRAH PLUS TURKEY', berangkat_tgl: '2027-01-03', pulang_tgl: '2027-01-11', paket_harga: PAKET_HARGA },
    { jadwal_id: 'C', jadwal_nama: 'UMRAH PLUS DUBAI', berangkat_tgl: '2027-01-04', pulang_tgl: '2027-01-12', paket_harga: PAKET_HARGA },
  ]);

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    search_any: ['turki', 'turkey'],
    include_departed: true,
  });

  assert.deepEqual(out.data.rows.map((row) => row.jadwal_id), ['A', 'B']);
  assert.ok(supabase.calls.some(
    ([method, filter]) => method === 'or' && filter === 'jadwal_nama.ilike.*turki*,jadwal_nama.ilike.*turkey*',
  ));
});

test('list_jadwal_paket membersihkan sintaks PostgREST dari setiap search_any', async () => {
  const supabase = filteringScheduleSupabase([]);
  await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    search_any: ['tu,r()%\\ki', 'turkey'],
    include_departed: true,
  });

  const orFilter = supabase.calls.find(([method]) => method === 'or')?.[1];
  assert.equal(orFilter, 'jadwal_nama.ilike.*tu r    ki*,jadwal_nama.ilike.*turkey*');
  assert.doesNotMatch(orFilter, /[()%\\]/);
});

test('tanggal mustahil di list_jadwal_paket menjadi toolError sebelum query', async () => {
  for (const key of ['berangkat_from', 'berangkat_to', 'covers_date']) {
    const supabase = stubSupabase({ data: [], error: null });
    const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), { [key]: '2026-13-01' });
    assert.equal(out.ok, false, `${key} harus ditolak`);
    assert.match(out.error, new RegExp(`${key}.*YYYY-MM-DD`));
    assert.equal(supabase.calls.length, 0);
  }

  const supabase = stubSupabase({ data: [], error: null });
  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    kota_pada_tanggal: { tanggal: '2026-13-01', kota: 'mekkah' },
  });
  assert.equal(out.ok, false);
  assert.match(out.error, /kota_pada_tanggal.*YYYY-MM-DD/);
  assert.equal(supabase.calls.length, 0);
});

test('list_jadwal_paket mempertahankan paket tanpa cache saat memfilter kota', async () => {
  const schedules = [
    { jadwal_id: 'DI-MEKKAH', jadwal_nama: 'UMRAH A', berangkat_tgl: '2026-12-27', pulang_tgl: '2027-01-04', paket_harga: PAKET_HARGA },
    { jadwal_id: 'DI-MADINAH', jadwal_nama: 'UMRAH B', berangkat_tgl: '2026-12-27', pulang_tgl: '2027-01-04', paket_harga: PAKET_HARGA },
    { jadwal_id: 'BELUM-CACHE', jadwal_nama: 'UMRAH C', berangkat_tgl: '2026-12-27', pulang_tgl: '2027-01-04', paket_harga: PAKET_HARGA },
  ];
  const itineraries = [
    { jadwal_id: 'DI-MEKKAH', content: { days: [{ dayNumber: 'Hari 6', location: 'Makkah' }] } },
    { jadwal_id: 'DI-MADINAH', content: { days: [{ dayNumber: 'Hari 6', location: 'Medinah' }] } },
  ];
  const supabase = filteringScheduleSupabase(schedules, itineraries);

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    include_departed: true,
    kota_pada_tanggal: { tanggal: '2027-01-01', kota: 'mekkah' },
  });

  assert.equal(out.ok, true);
  assert.deepEqual(out.data.rows.map((row) => row.jadwal_id), ['DI-MEKKAH', 'BELUM-CACHE']);
  assert.deepEqual(
    out.data.rows.map((row) => [row.itinerary_tersedia, row.kota_pada_tanggal]),
    [[true, 'Makkah'], [false, null]],
  );
  assert.deepEqual(out.data.rows[0].tur, []);
  assert.match(out.data.note, /1 paket belum punya itinerary tersimpan, posisi kotanya belum bisa dipastikan\./);
  assert.ok(supabase.calls.some(
    ([method, column, ids]) => method === 'in' && column === 'jadwal_id'
      && ids.join(',') === 'DI-MEKKAH,DI-MADINAH,BELUM-CACHE',
  ));
});

test('list_jadwal_paket memfilter label tur dari cache itinerary', async () => {
  const schedules = [
    { jadwal_id: 'TURKI', jadwal_nama: 'UMRAH PLUS', berangkat_tgl: '2027-01-02', pulang_tgl: '2027-01-10', paket_harga: PAKET_HARGA },
    { jadwal_id: 'DUBAI', jadwal_nama: 'UMRAH PLUS', berangkat_tgl: '2027-01-03', pulang_tgl: '2027-01-11', paket_harga: PAKET_HARGA },
    { jadwal_id: 'BELUM-CACHE', jadwal_nama: 'UMRAH PLUS', berangkat_tgl: '2027-01-04', pulang_tgl: '2027-01-12', paket_harga: PAKET_HARGA },
  ];
  const itineraries = [
    { jadwal_id: 'TURKI', content: { days: [{ dayNumber: 'Hari 1', location: 'Cappadocia' }] } },
    { jadwal_id: 'DUBAI', content: { days: [{ dayNumber: 'Hari 1', location: 'Dubai' }] } },
  ];
  const supabase = filteringScheduleSupabase(schedules, itineraries);

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    include_departed: true,
    tur: 'Tur Turki',
  });

  assert.deepEqual(out.data.rows.map((row) => row.jadwal_id), ['TURKI']);
  assert.deepEqual(out.data.rows[0].tur, ['Tur Turki']);
  assert.equal(out.data.rows[0].itinerary_tersedia, true);
});

test('list_jadwal_paket tidak memakai itinerary lama ketika hash PDF berubah', async () => {
  const schedules = [{
    jadwal_id: 'STALE',
    jadwal_nama: 'UMRAH PLUS',
    berangkat_tgl: '2027-01-02',
    pulang_tgl: '2027-01-10',
    paket_harga: PAKET_HARGA,
    itinerary_source_sha256: 'pdf-baru',
  }];
  const itineraries = [{
    jadwal_id: 'STALE',
    source_sha256: 'pdf-lama',
    content: { days: [{ dayNumber: 'Hari 1', location: 'Dubai' }] },
  }];
  const supabase = filteringScheduleSupabase(schedules, itineraries);

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    include_departed: true,
  });

  assert.equal(out.data.rows[0].itinerary_tersedia, false);
  assert.deepEqual(out.data.rows[0].tur, []);
});

test('list_jadwal_paket membatasi lookup itinerary ke 60 kandidat terdekat', async () => {
  const schedules = Array.from({ length: 61 }, (_, index) => ({
    jadwal_id: `JBU${String(index).padStart(2, '0')}`,
    jadwal_nama: `PAKET ${index}`,
    berangkat_tgl: `2027-01-${String((index % 28) + 1).padStart(2, '0')}`,
    pulang_tgl: '2027-02-10',
    paket_harga: PAKET_HARGA,
  }));
  const supabase = filteringScheduleSupabase(schedules);

  const out = await BANI_TOOL_BY_NAME.list_jadwal_paket.run(DEPS(supabase), {
    include_departed: true,
    limit: 50,
  });

  const requestedIds = supabase.calls.find(([method, column]) => method === 'in' && column === 'jadwal_id')?.[2];
  assert.equal(requestedIds.length, 60);
  assert.equal(out.data.total, 60);
  assert.equal(out.data.rows.length, 50);
  assert.match(out.data.note, /Penyaringan itinerary dibatasi ke 60 keberangkatan terdekat\./);
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
