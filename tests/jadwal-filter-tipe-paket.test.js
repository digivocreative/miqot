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
  SEMUA_JENIS_TYPE_VALUE,
  modeMenuValue,
  resolveModeMenuChoice,
  typeMenuValue,
  resolveTypeMenuChoice,
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

test('tak ada mode yang bergerbang kursi sendiri — kursi milik tombol mata', () => {
  // Sejak 2026-09-24 AVAILABLE tampil sebagai "Semua Jenis" dan tidak lagi
  // menyaring kursi. Tanpa availableOnly, SEMUA mode memuat dataset penuh
  // (diuji lewat bentuk tanpa sub-nilai, yang mengembalikan dasarnya apa adanya).
  for (const mode of ['AVAILABLE', 'LANDING DI', 'TIPE PAKET', 'DURASI PERJALANAN', 'DATA PER-BULAN', 'SEMUA DATA']) {
    assert.equal(filterPackages(DATA, { mode, today: TODAY }).length, DATA.length, mode);
    const gated = filterPackages(DATA, { mode, today: TODAY, availableOnly: true });
    assert.equal(gated.length, 5, mode);
    assert.equal(gated.every(p => p.seatSisa > 0), true, mode);
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

test('Urutkan pindah ke sheet Filter: tidak ada lagi daftar mode ber-sort', () => {
  // Dulu dropdown Urutkan menumpang di kolom kedua mode AVAILABLE; sejak
  // mode itu turun jadi opsi Jenis Paket, urutan hidup di sheet Filter dan
  // berlaku untuk SEMUA mode — jadi daftar pengecualiannya tidak boleh hidup lagi.
  assert.equal('MODES_WITH_SORT' in mod, false);
});

test('Semua Jenis = mode AVAILABLE yang tampil sebagai opsi pertama Jenis Paket', () => {
  // AVAILABLE tampil sebagai JENIS PAKET dengan sub-nilai "Semua Jenis" (dulu
  // "Seat Tersedia" — diganti saat kursi pindah ke tombol mata). Mode lain
  // tampil apa adanya.
  assert.equal(modeMenuValue('AVAILABLE'), 'TIPE PAKET');
  assert.equal(modeMenuValue('TIPE PAKET'), 'TIPE PAKET');
  assert.equal(modeMenuValue('LANDING DI'), 'LANDING DI');
  assert.equal(modeMenuValue('SEMUA DATA'), 'SEMUA DATA');

  assert.equal(SEMUA_JENIS_TYPE_VALUE, 'SEMUA JENIS');
  assert.equal(typeMenuValue('AVAILABLE', ''), SEMUA_JENIS_TYPE_VALUE);
  assert.equal(typeMenuValue('TIPE PAKET', 'UMROH SAJA'), 'UMROH SAJA');
  // Tautan lama /{agent}/tipe-paket (tanpa sub-nilai) tetap terbaca apa adanya.
  assert.equal(typeMenuValue('TIPE PAKET', ''), '');
});

test('memilih JENIS PAKET di dropdown utama mendarat di Semua Jenis', () => {
  // Sub-nilai bawaan Jenis Paket kini Semua Jenis (halaman bawaan), bukan
  // '- Pilih Jenis -'.
  assert.equal(resolveModeMenuChoice('TIPE PAKET'), 'AVAILABLE');
  assert.equal(resolveModeMenuChoice('LANDING DI'), 'LANDING DI');
  assert.equal(resolveModeMenuChoice('SEMUA DATA'), 'SEMUA DATA');
});

test('pilihan di dropdown Jenis Paket diterjemahkan ke mode + sub-nilai', () => {
  assert.deepEqual(resolveTypeMenuChoice(SEMUA_JENIS_TYPE_VALUE), { mode: 'AVAILABLE', secondaryValue: '' });
  assert.deepEqual(resolveTypeMenuChoice('UMROH SAJA'), { mode: 'TIPE PAKET', secondaryValue: 'UMROH SAJA' });
  assert.deepEqual(resolveTypeMenuChoice('PLUS TURKI'), { mode: 'TIPE PAKET', secondaryValue: 'PLUS TURKI' });
  // Nilai sentinel tidak boleh bertabrakan dengan tipe paket mana pun di roster.
  assert.equal(getFilterModeFromSlug(SEMUA_JENIS_TYPE_VALUE), null);

  // Hasilnya identik dengan halaman bawaan: semua jenis, kursi diatur tombol mata.
  const semua = filterPackages(DATA, { ...resolveTypeMenuChoice(SEMUA_JENIS_TYPE_VALUE), today: TODAY, availableOnly: true });
  assert.equal(semua.every(p => p.seatSisa > 0), true);
  assert.equal(semua.length, DATA.filter(p => p.seatSisa > 0).length);
});
