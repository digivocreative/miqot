import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  buildFilterSlug,
  resolveFilterSlug,
  getFilterModeFromSlug,
  filterModeLabel,
  JOURNEY_START_FILTER_VALUES,
  journeyStartLabel,
} from '../lib/filter-slug.js';
import { buildFilterShareMeta } from '../lib/filter-share-meta.js';

// Filter "AWAL PERJALANAN" di halaman jadwal publik: UMROH DULU, MADINAH DULU,
// dan satu opsi per destinasi tur yang membuka rantai (TUR DUBAI, TUR MESIR, …).
//
// Keanggotaannya WAJIB sama dengan rantai "Urutan Perjalanan" di kartu paket
// (getPackageJourneySteps) — simpul pertamanya itulah awal perjalanan. Kalau
// filter punya aturan sendiri, paket bisa masuk "MADINAH" sementara kartunya
// menampilkan Umroh lebih dulu.

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

const {
  getPackageJourneyStart,
  filterPackages,
  extractJourneyStarts,
  MODES_WITH_AVAILABILITY_TOGGLE,
} = await bundle('src/utils/filter-logic.ts', 'filter-logic-awal');
const { INTERNATIONAL_TOUR_LABELS } = await bundle('src/utils/journey.ts', 'journey-awal');
const { filterDimension } = await bundle('src/utils/filter-url.ts', 'filter-url-awal');

function pkg(nama, { rute = 'CGK - JED', pulang = 'MED - CGK', order, seat = 10, hotel } = {}) {
  return {
    jadwalId: nama,
    nama,
    seatSisa: seat,
    seatTotal: 45,
    keberangkatan: { tgl: '2026-11-10', jam: '08.00', rute },
    kepulangan: { tgl: '2026-11-19', jam: '16.00', rute: pulang },
    harga: { UHUD: { Quard: '33900000' } },
    hotel: hotel ?? { UHUD: { mekkah_hotel: 'ANJUM', madinah_hotel: 'SAJA' } },
    ...(order ? { journeyOrder: order, journeyOrderSource: 'itinerary' } : {}),
  };
}

// Bentuk NYATA dari data 1448 (lihat komentar per baris).
const UMROH = pkg('REGULER 9HR');                                                   // CGK-JED, pulang MED
const MADINAH_VIA_JED = pkg('REGULER 9HR (KERETA CEPAT)', { order: ['Madinah', 'Umroh'] }); // JBU1517: landing JED, itinerary Madinah dulu
const MADINAH_VIA_MED = pkg('PAKET HEMAT 9HR', { rute: 'CGK - MED', pulang: 'JED - CGK' });
const TOUR_DUBAI = pkg('HEMAT PLUS DUBAI 10HR', { rute: 'CGK-DXB / DXB-MED', pulang: 'JED - CGK' }); // JBU1569
const TOUR_MESIR = pkg('PLUS CAIRO + ALEXANDRIA 12HR', { rute: 'CGK-JED/JED-CAI/CAI-MED', pulang: 'JED - CGK', order: ['Tur Mesir', 'Madinah', 'Umroh'] }); // JBU1515
const TRANSIT_DXB = pkg('UMRAH HEMAT 9HR', { rute: 'CGK-DXB / DXB-MED', pulang: 'JED-DXB / DXB-CGK' }); // Emirates transit, bukan tur
const AMBIGU = pkg('UMRAH 9HR', { rute: 'CGK - JED', pulang: 'JED - CGK' });          // pp Jeddah tanpa itinerary

test('awal perjalanan = simpul pertama rantai Urutan Perjalanan di kartu', () => {
  assert.equal(getPackageJourneyStart(UMROH), 'UMROH');
  assert.equal(getPackageJourneyStart(MADINAH_VIA_MED), 'MADINAH');
  // Tur dipecah per destinasi — nilainya label simpul tur di kartu.
  assert.equal(getPackageJourneyStart(TOUR_DUBAI), 'TUR DUBAI');
  assert.equal(getPackageJourneyStart(TOUR_MESIR), 'TUR MESIR');
});

test('roster tur = semua tur internasional di journey.ts (paritas, bukan salinan buta)', () => {
  // lib/filter-slug.js (JS, dipakai server) tidak bisa mengimpor journey.ts, jadi
  // rosternya ditulis ulang di sana. Tes ini yang menjaga keduanya tetap sama:
  // tur baru di journey.ts tanpa baris di roster = opsinya diam-diam hilang.
  const tours = JOURNEY_START_FILTER_VALUES.filter(v => v.startsWith('TUR '));
  assert.deepEqual(tours, INTERNATIONAL_TOUR_LABELS.map(l => l.toUpperCase()));
  // Tur dalam Saudi (Taif/Badar/Red Sea) tidak pernah membuka rantai.
  assert.ok(!INTERNATIONAL_TOUR_LABELS.some(l => /Taif|Badar|Red Sea/.test(l)));
});

test('BUKAN landing: mendarat Jeddah tapi itinerary ke Madinah dulu → MADINAH', () => {
  // 29 paket 1448 berbentuk begini. Inilah yang membedakan filter ini dari
  // LANDING DI — dan alasan ia tidak boleh diturunkan dari kota landing.
  assert.equal(getPackageJourneyStart(MADINAH_VIA_JED), 'MADINAH');
});

test('transit DXB tanpa tur Dubai di nama/hotel bukan TOUR', () => {
  // Kode bandara saja hanya membuktikan pesawat lewat — aturan yang sama
  // dengan kartu (activeTours di getPackageJourneySteps).
  assert.equal(getPackageJourneyStart(TRANSIT_DXB), 'MADINAH');
});

test('hotel kota tur ikut mengaktifkan tur, sama seperti kartu', () => {
  // Kartu mengoper kota hotel tambahan (extraHotelsOf) ke rantainya; nama paket
  // di sini sengaja tidak menyebut Dubai.
  const viaHotel = pkg('UMRAH HEMAT 10HR', {
    rute: 'CGK-DXB / DXB-MED',
    pulang: 'JED - CGK',
    hotel: { UHUD: { mekkah_hotel: 'ANJUM', madinah_hotel: 'SAJA', dubai_hotel: 'ROVE' } },
  });
  assert.equal(getPackageJourneyStart(viaHotel), 'TUR DUBAI');
});

test('urutan tak bisa dipastikan → null, tidak dipaksa masuk salah satu', () => {
  assert.equal(getPackageJourneyStart(AMBIGU), null);
});

const DATA = [UMROH, MADINAH_VIA_JED, MADINAH_VIA_MED, TOUR_DUBAI, TOUR_MESIR, AMBIGU, pkg('REGULER HABIS', { seat: 0 })];
const names = list => list.map(p => p.nama).sort();

test('filterPackages: tiap sub-nilai hanya memuat awal perjalanannya', () => {
  const by = value => names(filterPackages(DATA, { mode: 'AWAL PERJALANAN', secondaryValue: value }));
  assert.deepEqual(by('UMROH'), ['REGULER 9HR', 'REGULER HABIS']);
  assert.deepEqual(by('MADINAH'), ['PAKET HEMAT 9HR', 'REGULER 9HR (KERETA CEPAT)']);
  assert.deepEqual(by('TUR DUBAI'), ['HEMAT PLUS DUBAI 10HR']);
  assert.deepEqual(by('TUR MESIR'), ['PLUS CAIRO + ALEXANDRIA 12HR']);
  // Destinasi tur tanpa paket = kosong, bukan semua tur.
  assert.deepEqual(by('TUR TURKI'), []);
  // Tanpa sub-nilai = seluruh paket, sama seperti mode berdimensi lain.
  assert.equal(filterPackages(DATA, { mode: 'AWAL PERJALANAN' }).length, DATA.length);
});

test('mode berdimensi: paket habis ikut tampil, tombol mata menyembunyikannya', () => {
  assert.ok(MODES_WITH_AVAILABILITY_TOGGLE.includes('AWAL PERJALANAN'));
  const on = filterPackages(DATA, { mode: 'AWAL PERJALANAN', secondaryValue: 'UMROH', availableOnly: true });
  assert.deepEqual(names(on), ['REGULER 9HR']);
});

test('opsi: Umroh Dulu, Madinah Dulu, lalu tur per destinasi — hanya yang punya paket, TANPA jumlah', () => {
  assert.deepEqual(extractJourneyStarts(DATA), [
    { value: 'UMROH', label: 'Umroh Dulu' },
    { value: 'MADINAH', label: 'Madinah Dulu' },
    { value: 'TUR DUBAI', label: 'Tur Dubai' },
    { value: 'TUR MESIR', label: 'Tur Mesir' },
  ]);
  assert.deepEqual(extractJourneyStarts([UMROH, AMBIGU]), [{ value: 'UMROH', label: 'Umroh Dulu' }]);
  assert.deepEqual(extractJourneyStarts([]), []);
});

// ── URL, label, kartu share ──

test('slug: /awal-umroh, /awal-madinah, /awal-tur-dubai … bolak-balik', () => {
  assert.deepEqual([...JOURNEY_START_FILTER_VALUES].slice(0, 2), ['UMROH', 'MADINAH']);
  for (const value of JOURNEY_START_FILTER_VALUES) {
    const slug = buildFilterSlug('AWAL PERJALANAN', value);
    assert.equal(slug, `awal-${value.toLowerCase().replace(/ /g, '-')}`);
    assert.deepEqual(resolveFilterSlug(slug), { mode: 'AWAL PERJALANAN', secondaryValue: value });
  }
  assert.equal(buildFilterSlug('AWAL PERJALANAN', 'TUR DUBAI'), 'awal-tur-dubai');
  assert.equal(buildFilterSlug('AWAL PERJALANAN', ''), 'awal-perjalanan');
  assert.deepEqual(resolveFilterSlug('awal-perjalanan'), { mode: 'AWAL PERJALANAN' });
});

test('slug awal-* itu tertutup: yang asing tetap dibaca sebagai ID paket', () => {
  // main.tsx memakai getFilterModeFromSlug sebagai gerbang negatif.
  // 'awal-tour' sempat ada sebelum TOUR dipecah per destinasi (tak pernah
  // ter-deploy) — sekarang slug asing juga.
  for (const asing of ['awal-', 'awal-mekkah', 'awal-ngawur', 'awal-umroh-dulu', 'awal-tour', 'awal-tur', 'awal-tur-taif', 'JBU1574']) {
    assert.equal(getFilterModeFromSlug(asing), null, asing);
  }
  assert.equal(buildFilterSlug('AWAL PERJALANAN', 'NGAWUR'), 'awal-perjalanan');
});

test('label: mode tampil "AWAL PERJALANAN", sub-nilai Umroh Dulu / Madinah Dulu / Tur X', () => {
  assert.equal(filterModeLabel('AWAL PERJALANAN'), 'AWAL PERJALANAN');
  assert.equal(journeyStartLabel('UMROH'), 'Umroh Dulu');
  assert.equal(journeyStartLabel('MADINAH'), 'Madinah Dulu');
  assert.equal(journeyStartLabel('TUR DUBAI'), 'Tur Dubai');
  assert.equal(journeyStartLabel('TUR AQSHA'), 'Tur Aqsha');
});

test('telemetri memakai dimensi "awal", bukan "mode"', () => {
  assert.equal(filterDimension('AWAL PERJALANAN'), 'awal');
});

test('kartu share & judul tab per awal perjalanan', () => {
  const nikita = { agentName: 'Nikita Sari', agentSlug: 'nikita' };
  const madinah = buildFilterShareMeta({ filterSlug: 'awal-madinah', ...nikita });
  assert.equal(madinah.eyebrow, 'AWAL PERJALANAN');
  assert.equal(madinah.headline, 'Madinah Dulu');
  assert.equal(madinah.title, 'Madinah Dulu — Jadwal Umroh Alhijaz | Nikita Sari');
  assert.match(madinah.description, /paket umroh yang dimulai dari Madinah/);
  assert.equal(madinah.ogImagePath, '/og/filter/nikita/awal-madinah.png');

  const umroh = buildFilterShareMeta({ filterSlug: 'awal-umroh', ...nikita });
  assert.equal(umroh.title, 'Umroh Dulu — Jadwal Umroh Alhijaz | Nikita Sari');
  assert.match(umroh.description, /paket umroh yang dimulai dengan ibadah umroh/);

  const tour = buildFilterShareMeta({ filterSlug: 'awal-tur-dubai', ...nikita });
  assert.equal(tour.headline, 'Tur Dubai');
  assert.equal(tour.title, 'Mulai dari Tur Dubai — Jadwal Umroh Alhijaz | Nikita Sari');
  assert.match(tour.description, /paket umroh yang dimulai dengan Tur Dubai/);
  assert.equal(tour.ogImagePath, '/og/filter/nikita/awal-tur-dubai.png');

  const bare = buildFilterShareMeta({ filterSlug: 'awal-perjalanan', ...nikita });
  assert.equal(bare.headline, 'Awal Perjalanan');
  assert.match(bare.description, /paket umroh menurut awal perjalanan/);
});

// ── Sambungan di FilterHeader ──

test('LANDING DI keluar dari dropdown, tapi link lamanya tetap hidup (mode URL-saja)', () => {
  // Pola LIBURAN SEKOLAH & CUTI 5 HARI: /nikita/landing-madinah sudah tersebar
  // di WhatsApp, dan main.tsx membaca slug tak dikenal sebagai ID paket —
  // mencabut slug-nya = "Paket tidak ditemukan".
  const filterHeader = readFileSync(join(root, 'src/components/FilterHeader.tsx'), 'utf8');
  const optionsBlock = filterHeader.match(/const FILTER_MODE_OPTIONS[\s\S]*?\n\];/)?.[0] ?? '';
  assert.doesNotMatch(optionsBlock, /value: 'LANDING DI'/);
  for (const slug of ['landing-madinah', 'landing-jeddah', 'landing-di']) {
    assert.equal(getFilterModeFromSlug(slug), 'LANDING DI', slug);
  }
  assert.equal(buildFilterShareMeta({ filterSlug: 'landing-madinah', agentName: 'Nikita Sari', agentSlug: 'nikita' })?.headline, 'Madinah');
  // Datang lewat link: trigger tetap berlabel (entri sintetis) dan sub-filter
  // kotanya tetap dirender, supaya pengunjung tahu filter apa yang aktif.
  assert.match(filterHeader, /options\.push\(\{ value: modeMenu, label: filterModeLabel\(modeMenu\) \}\)/);
  assert.match(filterHeader, /const showLandingDropdown = filterMode === 'LANDING DI';/);
  assert.match(filterHeader, /ariaLabel="Pilih Landing"/);
});

test('dropdown utama & sub-filter AWAL PERJALANAN tersambung seperti Landing', () => {
  const filterHeader = readFileSync(join(root, 'src/components/FilterHeader.tsx'), 'utf8');
  const optionsBlock = filterHeader.match(/const FILTER_MODE_OPTIONS[\s\S]*?\n\];/)?.[0] ?? '';
  assert.match(optionsBlock, /value: 'AWAL PERJALANAN', label: filterModeLabel\('AWAL PERJALANAN'\)/);
  assert.ok(
    optionsBlock.indexOf("value: 'TIPE PAKET'") < optionsBlock.indexOf("value: 'AWAL PERJALANAN'")
      && optionsBlock.indexOf("value: 'AWAL PERJALANAN'") < optionsBlock.indexOf("value: 'DURASI PERJALANAN'"),
    'AWAL PERJALANAN duduk di antara JENIS PAKET dan DURASI PERJALANAN',
  );

  const block = filterHeader.match(
    /<FilterDropdown\s(?:(?!<FilterDropdown\s)[\s\S])*?ariaLabel="Pilih Awal Perjalanan"(?:(?!<FilterDropdown\s)[\s\S])*?\/>/,
  )?.[0] ?? '';
  assert.notEqual(block, '', 'dropdown Awal Perjalanan tidak ditemukan');
  assert.match(block, /ref=\{subFilterRef\}/);
  assert.match(block, /onOpenChange=\{handleMenuOpenChange\}/);
  assert.match(block, /options=\{upperLabels\(\[/);
  // Tanpa jumlah paket di label (permintaan user).
  assert.match(block, /\.\.\.journeyStartOptions\]\)/);
  assert.doesNotMatch(block, /paket\)/);
  // Roster dari rosterPackages — gerbang kursi yang sama dengan hasilnya.
  assert.match(filterHeader, /extractJourneyStarts\(rosterPackages\)/);
  assert.match(filterHeader, /showJourneyStartDropdown \? journeyStartOptions\.length/);
});
