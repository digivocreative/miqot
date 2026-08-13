import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Opsi sub-filter mode 'LANDING DI'. Sama seperti
// tests/jadwal-filter-tipe-paket.test.js: filter-logic.ts itu TypeScript
// ber-alias '@', jadi dibundel dulu oleh esbuild.

const root = new URL('..', import.meta.url).pathname;

async function importFilterLogic() {
  const dir = await mkdtemp(join(tmpdir(), 'filter-logic-landing-'));
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

const { extractUniqueLandings, LANDING_FILTER_CODES, filterModeLabel } = await importFilterLogic();

function pkg(nama, rute) {
  return {
    jadwal_id: nama,
    nama,
    isPromo: false,
    seatSisa: 10,
    seatTotal: 46,
    maskapai: 'SAUDIA',
    keberangkatan: { tgl: '2026-10-07', jam: '08.00', rute },
    kepulangan: { tgl: '2026-10-16', jam: '16.00', rute: 'JED-CGK' },
    harga: { UHUD: { Quard: '33900000' } },
    hotel: {},
  };
}

test('opsi landing hanya Jeddah & Madinah', () => {
  const options = extractUniqueLandings([
    pkg('LANDING JED', 'CGK-JED'),
    pkg('LANDING JED VIA DXB', 'CGK-DXB / DXB-JED'),
    pkg('LANDING MED', 'CGK-MED'),
    // Rute yang tidak pernah menyentuh Saudi: getLandingAirportCode jatuh ke
    // kedatangan terakhir (IST/CAI). Itu bukan kota landing — jangan jadi opsi.
    pkg('TUR TURKI SAJA', 'CGK-IST'),
    pkg('TUR MESIR SAJA', 'CGK-CAI'),
  ]);

  assert.deepEqual(options.map(o => o.code).sort(), ['JED', 'MED']);
  assert.deepEqual(options.map(o => o.name).sort(), ['Jeddah', 'Madinah']);
  assert.equal(options.find(o => o.code === 'JED').packageCount, 2);
  assert.equal(options.find(o => o.code === 'MED').packageCount, 1);
});

test('daftar kode landing dipakai bersama, bukan literal tersebar', () => {
  assert.deepEqual([...LANDING_FILTER_CODES], ['JED', 'MED']);
});

test('label mode: TIPE PAKET tampil "JENIS PAKET", nilainya tidak berubah', () => {
  assert.equal(filterModeLabel('TIPE PAKET'), 'JENIS PAKET');
  assert.equal(filterModeLabel('LANDING DI'), 'LANDING DI');
  // Mode URL-saja tetap punya teks yang bisa dibaca di trigger dropdown.
  assert.equal(filterModeLabel('LIBURAN_SEKOLAH'), 'LIBURAN SEKOLAH');
});
