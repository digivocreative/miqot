import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Filter ⇄ URL halaman jadwal publik. Yang dijaga di sini janji intinya: filter
// yang dipilih agent HARUS selamat saat link-nya disalin ke jamaah, dan link
// yang sudah tersebar HARUS tetap membuka filter yang sama.
// TypeScript ber-alias '@' → dibundel dulu oleh esbuild (pola sama dengan
// tests/jadwal-filter-tipe-paket.test.js).

const root = new URL('..', import.meta.url).pathname;

async function bundle(entry, name) {
  const dir = await mkdtemp(join(tmpdir(), `${name}-`));
  const outfile = join(dir, `${name}.mjs`);
  await build({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    alias: { '@': join(root, 'src') },
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

const { buildFilterSearch, parseFilterSearch, filterDimension, QUICK_FILTER_VALUES, URGENT_SEAT_THRESHOLD } =
  await bundle('src/utils/filter-url.ts', 'filter-url');
const { buildFilterSlug, resolveFilterSlug, getFilterModeFromSlug } =
  await bundle('src/utils/filter-logic.ts', 'filter-logic');

// ── Segmen path: mode + sub-nilai jadi satu slug terbaca ──

test('sub-nilai jadi satu segmen yang bisa dibaca manusia', () => {
  const cases = [
    { mode: 'LANDING DI', value: 'MED', slug: 'landing-madinah' },
    { mode: 'LANDING DI', value: 'JED', slug: 'landing-jeddah' },
    { mode: 'DATA PER-BULAN', value: '2026-11', slug: 'november-2026' },
    { mode: 'DATA PER-BULAN', value: '2027-01', slug: 'januari-2027' },
    { mode: 'DURASI PERJALANAN', value: '9', slug: '9-hari' },
    { mode: 'TIPE PAKET', value: 'UMROH PROMO', slug: 'umroh-promo' },
    { mode: 'TIPE PAKET', value: 'PLUS DUBAI', slug: 'plus-dubai' },
  ];
  for (const { mode, value, slug } of cases) {
    assert.equal(buildFilterSlug(mode, value), slug, `${mode} → slug`);
    assert.deepEqual(resolveFilterSlug(slug), { mode, secondaryValue: value }, `${slug} → filter`);
  }
});

test('tanpa sub-nilai tetap slug mode lama', () => {
  assert.equal(buildFilterSlug('LANDING DI', ''), 'landing-di');
  assert.equal(buildFilterSlug('DATA PER-BULAN'), 'data-per-bulan');
  assert.equal(buildFilterSlug('AVAILABLE', ''), '');
  assert.equal(buildFilterSlug('SEMUA DATA'), 'semua-data');
  // Sub-nilai ngawur tidak boleh menghasilkan slug ngawur.
  assert.equal(buildFilterSlug('DATA PER-BULAN', 'November'), 'data-per-bulan');
  assert.equal(buildFilterSlug('LANDING DI', 'DXB'), 'landing-di');
});

test('slug asing TETAP null — main.tsx memakainya sebagai gerbang ID paket', () => {
  // Kalau salah satu pola di atas kelewat longgar, /{agent}/JBU1574 berhenti
  // membuka detail paket dan berubah jadi daftar jadwal.
  for (const asing of ['jbu1574', 'jbu-1574', '2026-11', 'madinah', 'landing-', 'hari', '9hari', 'nikita', '']) {
    assert.equal(getFilterModeFromSlug(asing), null, asing);
  }
});

test('slug lama tetap hidup', () => {
  assert.deepEqual(resolveFilterSlug('landing-di'), { mode: 'LANDING DI' });
  assert.deepEqual(resolveFilterSlug('tipe-paket'), { mode: 'TIPE PAKET' });
  assert.deepEqual(resolveFilterSlug('umroh-promo'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH PROMO' });
  assert.deepEqual(resolveFilterSlug('bintang-5'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH RAHMAH' });
  assert.equal(getFilterModeFromSlug('cuti-5-hari'), 'UMROH CUTI 5 HARI');
  assert.equal(getFilterModeFromSlug('liburan-sekolah'), 'LIBURAN_SEKOLAH');
});

// ── Query: filter sheet + urutan ──

test('filter sheet & urutan jadi query pendek tanpa %2C', () => {
  const search = buildFilterSearch({
    quickFilter: 'promo',
    departureRanges: ['12-18', '00-06'],
    returnRanges: ['18-24'],
    sortOrder: 'HARGA_TERMURAH',
  });
  // Koma harus tetap koma: URLSearchParams.toString() menulisnya %2C — itu
  // yang membuat URL lama terlihat berantakan.
  assert.equal(search, '?promo&berangkat=dini-hari,siang&pulang=malam&urut=termurah');
  assert.ok(!search.includes('%'), 'query tidak boleh memuat persen-encoding');

  const parsed = parseFilterSearch(search);
  assert.equal(parsed.quickFilter, 'promo');
  assert.deepEqual(parsed.departureRanges, ['00-06', '12-18']);
  assert.deepEqual(parsed.returnRanges, ['18-24']);
  assert.equal(parsed.sortOrder, 'HARGA_TERMURAH');
});

test('nilai bawaan tidak mengotori URL', () => {
  assert.equal(buildFilterSearch({ sortOrder: 'TANGGAL_TERDEKAT' }), '');
  assert.equal(buildFilterSearch({}), '');
  assert.equal(buildFilterSearch({ quickFilter: null, departureRanges: [] }), '');
});

test('nilai ngawur diabaikan, bukan diteruskan ke filter (fail-closed)', () => {
  const parsed = parseFilterSearch('?landing=jakarta&bulan=November&durasi=abc&tipe=paket-ngawur&berangkat=subuh&urut=acak');
  assert.deepEqual(parsed.secondary, {});
  assert.equal(parsed.quickFilter, null);
  assert.deepEqual(parsed.departureRanges, []);
  assert.equal(parsed.sortOrder, null);
});

test('link bentuk lama tetap membuka filter yang sama', () => {
  // `?tipe=` sudah tersebar (ditulis versi produksi sebelumnya).
  assert.equal(parseFilterSearch('?tipe=umroh-promo').secondary['TIPE PAKET'], 'UMROH PROMO');
  assert.equal(parseFilterSearch('?landing=med').secondary['LANDING DI'], 'MED');
  assert.equal(parseFilterSearch('?bulan=2026-11').secondary['DATA PER-BULAN'], '2026-11');
  assert.equal(parseFilterSearch('?durasi=09').secondary['DURASI PERJALANAN'], '9');
  assert.equal(parseFilterSearch('?cepat=promo').quickFilter, 'promo');
  assert.deepEqual(parseFilterSearch('?berangkat=00-06,12-18').departureRanges, ['00-06', '12-18']);
  assert.equal(parseFilterSearch('?urut=harga-termurah').sortOrder, 'HARGA_TERMURAH');
});

test('filter cepat tinggal dua yang tidak punya jalan lain', () => {
  assert.deepEqual([...QUICK_FILTER_VALUES], ['promo', 'urgent']);
  assert.equal(URGENT_SEAT_THRESHOLD, 5);
  // 'termurah' & 'rahmah' sengaja dibuang (duplikat Urutkan & Jenis Paket).
  assert.equal(parseFilterSearch('?rahmah').quickFilter, null);
  assert.equal(parseFilterSearch('?cepat=rahmah').quickFilter, null);
});

test('dimensi telemetri memakai nama dimensi yang stabil', () => {
  assert.equal(filterDimension('LANDING DI'), 'landing');
  assert.equal(filterDimension('DATA PER-BULAN'), 'bulan');
  assert.equal(filterDimension('AVAILABLE'), 'mode');
});

test('event jadwal_filter terdaftar di whitelist & punya label', async () => {
  // Event publik yang tidak masuk VALID_PUBLIC_EVENTS ditolak 400 dan hilang
  // diam-diam — telemetri filter jadi nol tanpa satu pun galat terlihat.
  const server = await readFile(join(root, 'server.js'), 'utf8');
  const whitelist = server.match(/const VALID_PUBLIC_EVENTS = \[[\s\S]*?\];/)?.[0] ?? '';
  assert.notEqual(whitelist, '', 'VALID_PUBLIC_EVENTS tidak ditemukan');
  assert.match(whitelist, /'jadwal_filter'/);
  const labels = server.match(/const ALL_EVENT_LABELS = \{[\s\S]*?\n\};/)?.[0] ?? '';
  assert.match(labels, /jadwal_filter: '[^']+'/);
});
