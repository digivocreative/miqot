import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Label opsi dropdown "DATA PER-BULAN" di halaman jadwal publik:
// "JUN 2026 (350/400)" = bulan 3 huruf + tahun + (sisa seat / total seat).
// filter-logic.ts itu TypeScript ber-alias '@', jadi dibundel dulu (pola
// tests/jadwal-filter-tipe-paket.test.js).

const root = new URL('..', import.meta.url).pathname;

async function importFilterLogic() {
  const dir = await mkdtemp(join(tmpdir(), 'filter-logic-bulan-'));
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

const { groupByMonth, monthOptionLabel } = await importFilterLogic();

function pkg(tgl, seatSisa, seatTotal) {
  return {
    nama: `PAKET ${tgl}`,
    seatSisa,
    seatTotal,
    keberangkatan: { tgl, jam: '08.00' },
    kepulangan: { tgl, jam: '16.00' },
    harga: {},
    hotel: {},
  };
}

test('label bulan: 3 huruf + tahun + (sisa/total) dari seluruh paket di bulan itu', () => {
  const groups = groupByMonth([
    pkg('2026-06-10', 200, 250),
    pkg('2026-06-24', 150, 150),
    pkg('2026-08-05', 0, 45),
  ]);
  assert.deepEqual(groups.map(monthOptionLabel), ['Jun 2026 (350/400)', 'Agu 2026 (0/45)']);
});

test('singkatan 12 bulan mengikuti kartu paket di halaman yang sama (id-ID: Mei, Agu, Okt, Des)', () => {
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const labels = months.map(m => monthOptionLabel({ monthKey: `2026-${m}`, availableSeat: 1, totalSeat: 2 }));
  assert.deepEqual(labels.map(l => l.split(' ')[0]), [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ]);
});

test('hitungan kursi rusak (NaN dari parseInt upstream) → nama bulan saja, bukan "(NaN/NaN)"', () => {
  assert.equal(monthOptionLabel({ monthKey: '2026-11', availableSeat: Number.NaN, totalSeat: 400 }), 'Nov 2026');
  assert.equal(monthOptionLabel({ monthKey: '2026-11', availableSeat: 10, totalSeat: Number.NaN }), 'Nov 2026');
});

test('dropdown Bulan memakai label ini (dan tetap huruf besar)', () => {
  const filterHeader = readFileSync(join(root, 'src/components/FilterHeader.tsx'), 'utf8');
  const block = filterHeader.match(
    /<FilterDropdown(?:(?!<FilterDropdown)[\s\S])*?ariaLabel="Pilih Bulan"(?:(?!<FilterDropdown)[\s\S])*?\/>/,
  )?.[0] ?? '';
  assert.notEqual(block, '', 'dropdown Bulan tidak ditemukan');
  assert.match(block, /label: monthOptionLabel\(m\)/);
  assert.match(block, /options=\{upperLabels\(\[/);
});
