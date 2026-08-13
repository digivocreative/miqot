import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Mode filter 'TIPE PAKET' di halaman jadwal publik: PERILAKUnya, bukan teksnya.
// filter-logic.ts itu TypeScript ber-alias '@', jadi dibundel dulu oleh esbuild
// (pola yang sama dipakai tests/brochure-prompt-schedule.test.js).

const root = new URL('..', import.meta.url).pathname;

async function importFilterLogic() {
  const dir = await mkdtemp(join(tmpdir(), 'filter-logic-'));
  const outfile = join(dir, 'filter-logic.mjs');
  await build({
    entryPoints: [join(root, 'src/utils/filter-logic.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    alias: { '@': join(root, 'src') },
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

const mod = await importFilterLogic();
const {
  filterPackages,
  getFilterSlug,
  getFilterModeFromSlug,
  resolveFilterSlug,
  FILTER_MODE_SLUGS,
  LEGACY_FILTER_SLUGS,
  MODES_WITH_SORT,
} = mod;

function pkg(nama, over = {}) {
  return {
    jadwal_id: nama,
    nama,
    isPromo: false,
    seatSisa: 10,
    seatTotal: 46,
    maskapai: 'SAUDIA',
    keberangkatan: { tgl: '2026-10-07', jam: '08.00' },
    kepulangan: { tgl: '2026-10-16', jam: '16.00' },
    harga: { UHUD: { Quard: '33900000' } },
    hotel: {},
    ...over,
  };
}

const DATA = [
  pkg('REGULER 9HR'),
  pkg('PLUS TURKEY 15HR ( KERETA CEPAT)'),
  pkg('UMRAH HEMAT 9HR', { isPromo: true }),
  pkg('MIX 12HR', { harga: { UHUD: {}, RAHMAH: {} } }),
  pkg('UMRAH MUSIM DINGIN 9HR', { keberangkatan: { tgl: '2026-12-27', jam: '08.00' } }),
  pkg('REGULER 9HR SOLD OUT', { seatSisa: 0 }),
  pkg('MIX RAHMAH SOLD OUT', { seatSisa: 0, harga: { RAHMAH: {} } }),
];

const TODAY = new Date('2026-08-12T00:00:00Z'); // jendela musim dingin: Des 2026 + Jan 2027

const names = list => list.map(p => p.nama).sort();

test('TIPE PAKET tanpa sub-nilai = seluruh paket, termasuk yang habis', () => {
  const result = filterPackages(DATA, { mode: 'TIPE PAKET', today: TODAY });
  assert.equal(result.length, DATA.length);
});

test('TIPE PAKET ikut menampilkan paket sold out', () => {
  const rahmah = filterPackages(DATA, { mode: 'TIPE PAKET', secondaryValue: 'UMROH RAHMAH', today: TODAY });
  assert.deepEqual(names(rahmah), ['MIX 12HR', 'MIX RAHMAH SOLD OUT']);
});

test('gerbang kursi tinggal milik SEAT TERSEDIA saja', () => {
  // Satu-satunya mode yang menyembunyikan paket habis.
  const available = filterPackages(DATA, { mode: 'AVAILABLE', today: TODAY });
  assert.equal(available.every(p => p.seatSisa > 0), true);
  assert.equal(available.length, 5);

  // Mode lain berangkat dari dataset penuh. Diuji lewat bentuk tanpa sub-nilai,
  // yang mengembalikan dataset dasarnya apa adanya — kalau gerbang kursi bocor
  // ke sini lagi, panjangnya turun jadi 5.
  for (const mode of ['LANDING DI', 'TIPE PAKET', 'DURASI PERJALANAN', 'DATA PER-BULAN', 'SEMUA DATA']) {
    assert.equal(filterPackages(DATA, { mode, today: TODAY }).length, DATA.length, mode);
  }
});

test('mode URL-saja juga memuat paket habis', () => {
  const libur = [
    pkg('LIBUR HABIS', { seatSisa: 0, keberangkatan: { tgl: '2026-06-20', jam: '08.00' } }),
    pkg('LIBUR ADA', { keberangkatan: { tgl: '2026-07-02', jam: '08.00' } }),
    pkg('BUKAN LIBUR', { keberangkatan: { tgl: '2026-09-02', jam: '08.00' } }),
  ];
  assert.deepEqual(names(filterPackages(libur, { mode: 'LIBURAN_SEKOLAH' })), ['LIBUR ADA', 'LIBUR HABIS']);

  // Berangkat Sabtu, pulang Senin dini hari → cuti 5 hari kerja.
  const cuti = { keberangkatan: { tgl: '2026-10-10', jam: '20.00' }, kepulangan: { tgl: '2026-10-19', jam: '02.00' } };
  const data = [pkg('CUTI HABIS', { ...cuti, seatSisa: 0 }), pkg('CUTI ADA', cuti)];
  assert.deepEqual(names(filterPackages(data, { mode: 'UMROH CUTI 5 HARI' })), ['CUTI ADA', 'CUTI HABIS']);
});

test('TIPE PAKET: Umroh Rahmah dari tier di `harga`, bukan dari nama', () => {
  const data = [
    pkg('REGULER 9HR (KERETA CEPAT)', { harga: { UHUD: {}, RAHMAH: {} } }), // menjual RAHMAH tanpa menyebutnya
    pkg('UMRAH PAKET RAHMAH 9HR', { harga: { UHUD: {} } }),                // menyebut tanpa menjualnya
  ];
  const result = filterPackages(data, { mode: 'TIPE PAKET', secondaryValue: 'UMROH RAHMAH', today: TODAY });
  assert.deepEqual(names(result), ['REGULER 9HR (KERETA CEPAT)']);
});

test('TIPE PAKET: Umroh Musim Dingin mengikuti jendela relatif `today`', () => {
  const winter = filterPackages(DATA, {
    mode: 'TIPE PAKET',
    secondaryValue: 'UMROH MUSIM DINGIN',
    today: TODAY,
  });
  assert.deepEqual(names(winter), ['UMRAH MUSIM DINGIN 9HR']);

  // Setahun kemudian jendelanya bergeser ke Des 2027 → paket Des 2026 keluar.
  const nextYear = filterPackages(DATA, {
    mode: 'TIPE PAKET',
    secondaryValue: 'UMROH MUSIM DINGIN',
    today: new Date('2027-08-12T00:00:00Z'),
  });
  assert.deepEqual(nextYear, []);
});

test('TIPE PAKET: Kereta Cepat & Plus Turki bisa memuat paket yang sama', () => {
  const kereta = filterPackages(DATA, { mode: 'TIPE PAKET', secondaryValue: 'KERETA CEPAT', today: TODAY });
  const turki = filterPackages(DATA, { mode: 'TIPE PAKET', secondaryValue: 'PLUS TURKI', today: TODAY });
  assert.deepEqual(names(kereta), ['PLUS TURKEY 15HR ( KERETA CEPAT)']);
  assert.deepEqual(names(turki), ['PLUS TURKEY 15HR ( KERETA CEPAT)']);
});

test('TIPE PAKET: tipe yang tidak dikenal menghasilkan nol paket, bukan semua paket', () => {
  const result = filterPackages(DATA, { mode: 'TIPE PAKET', secondaryValue: 'PLUS NGAWUR', today: TODAY });
  assert.deepEqual(result, []);
});

test('slug: mode baru dua arah, 5 mode lama sudah tidak ada lagi', () => {
  assert.equal(getFilterSlug('TIPE PAKET'), 'tipe-paket');
  assert.equal(getFilterModeFromSlug('tipe-paket'), 'TIPE PAKET');
  for (const gone of ['PROMO', 'UMROH REGULER', 'UMROH MUSIM DINGIN', 'BINTANG 5']) {
    assert.equal(Object.hasOwn(FILTER_MODE_SLUGS, gone), false, gone);
  }
});

test('slug lama TETAP dikenali — src/main.tsx memakainya sebagai gerbang negatif', () => {
  // Kalau slug ini tak dikenali, /umroh-promo dan /{agent}/umroh-promo dibaca
  // sebagai ID paket dan merender "Paket tidak ditemukan" (HTTP 200).
  for (const slug of ['umroh-promo', 'umroh-reguler', 'umroh-musim-dingin', 'bintang-5']) {
    assert.equal(getFilterModeFromSlug(slug), 'TIPE PAKET', slug);
  }
  assert.deepEqual(resolveFilterSlug('umroh-promo'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH PROMO' });
  assert.deepEqual(resolveFilterSlug('umroh-reguler'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH SAJA' });
  assert.deepEqual(resolveFilterSlug('umroh-musim-dingin'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH MUSIM DINGIN' });
  // 'bintang-5' → Umroh Rahmah: RAHMAH itulah tier hotel bintang 5.
  assert.deepEqual(resolveFilterSlug('bintang-5'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH RAHMAH' });
  assert.equal(resolveFilterSlug('ngawur'), null);
  // Preset tiap alias harus tipe yang benar-benar ada di roster.
  for (const [slug, target] of Object.entries(LEGACY_FILTER_SLUGS)) {
    const result = filterPackages(DATA, { mode: target.mode, secondaryValue: target.secondaryValue, today: TODAY });
    assert.ok(Array.isArray(result), slug);
  }
});

test('/cuti-5-hari tetap menyaring: hilang dari dropdown, tidak dari URL', () => {
  assert.equal(getFilterModeFromSlug('cuti-5-hari'), 'UMROH CUTI 5 HARI');
  const data = [
    // Berangkat Sabtu, pulang Senin dini hari → cuti 5 hari kerja.
    pkg('CUTI', { keberangkatan: { tgl: '2026-10-10', jam: '20.00' }, kepulangan: { tgl: '2026-10-19', jam: '02.00' } }),
    pkg('BUKAN CUTI', { keberangkatan: { tgl: '2026-10-07', jam: '08.00' }, kepulangan: { tgl: '2026-10-16', jam: '16.00' } }),
  ];
  assert.deepEqual(names(filterPackages(data, { mode: 'UMROH CUTI 5 HARI' })), ['CUTI']);
});

test('MODES_WITH_SORT: hanya mode tanpa sub-nilai sendiri', () => {
  assert.deepEqual([...MODES_WITH_SORT], ['AVAILABLE', 'LIBURAN_SEKOLAH', 'UMROH CUTI 5 HARI']);
  // Mode bersub-nilai memakai kolom kedua untuk nilainya, bukan untuk sort.
  for (const mode of ['TIPE PAKET', 'LANDING DI', 'DATA PER-BULAN', 'DURASI PERJALANAN']) {
    assert.equal(MODES_WITH_SORT.includes(mode), false, mode);
  }
});
