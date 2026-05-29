import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBerangkatMendatang } from '../lib/laporan-stats.js';

test('buildBerangkatMendatang includes the nearest upcoming month across Hijriah year boundary', () => {
  const rows = [
    {
      nama: 'Jamaah 18 Juni',
      paket: 'Paket 1448',
      jk: 'L',
      tgl_berangkat: '2026-06-18',
      hijriah_year: '1448',
      sisa: 0,
      wa: null,
    },
    {
      nama: 'Jamaah 13 Juni',
      paket: 'Paket 1447',
      jk: 'P',
      tgl_berangkat: '2026-06-13',
      hijriah_year: '1447',
      sisa: 1000000,
      wa: '628123',
    },
    {
      nama: 'Jamaah Juli',
      paket: 'Paket Juli',
      jk: 'L',
      tgl_berangkat: '2026-07-01',
      hijriah_year: '1448',
      sisa: 0,
      wa: null,
    },
  ];

  const result = buildBerangkatMendatang(rows, '2026-05-29');

  assert.equal(result.berangkatBulan, 'Juni 2026');
  assert.equal(result.berangkatSegera, 2);
  assert.deepEqual(
    result.berangkatBulanIni.map(item => item.nama),
    ['Jamaah 13 Juni', 'Jamaah 18 Juni'],
  );
});
