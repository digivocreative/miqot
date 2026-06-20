import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBerangkatMendatang, computeUmrohKomisi } from '../lib/laporan-stats.js';

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

test('buildBerangkatMendatang marks lunas for sisa <= 0 (incl. lebih bayar) and null', () => {
  const rows = [
    { nama: 'Lunas Pas', tgl_berangkat: '2026-06-10', sisa: 0 },
    { nama: 'Lebih Bayar', tgl_berangkat: '2026-06-11', sisa: -110700000 },
    { nama: 'Sisa Null', tgl_berangkat: '2026-06-12', sisa: null },
    { nama: 'Belum Lunas', tgl_berangkat: '2026-06-13', sisa: 1000000 },
  ];

  const result = buildBerangkatMendatang(rows, '2026-06-01');
  const lunasByNama = Object.fromEntries(
    result.berangkatBulanIni.map(item => [item.nama, item.lunas]),
  );

  assert.equal(lunasByNama['Lunas Pas'], true);
  assert.equal(lunasByNama['Lebih Bayar'], true);   // sisa<0 = overpaid → lunas
  assert.equal(lunasByNama['Sisa Null'], true);     // null = lunas (konvensi sistem)
  assert.equal(lunasByNama['Belum Lunas'], false);
});

test('computeUmrohKomisi excludes Belum DP rows from estimasi komisi', () => {
  const k = computeUmrohKomisi([
    { paket: 'REGULER Quad', bayar: 0, sisa: 30_000_000, tgl_berangkat: '2026-08-01', diskon_marketing: 0 },
    { paket: 'HEMAT Triple', bayar: 5_000_000, sisa: 20_000_000, tgl_berangkat: '2026-08-01', diskon_marketing: 0 },
    { paket: 'REGULER Quad', bayar: 45_000_000, sisa: 0, tgl_berangkat: '2026-08-01', diskon_marketing: 0 },
  ], '2026-06-20');

  assert.equal(k.totalKomisi, 3_100_000);
  assert.equal(k.sudahCair, 0);
  assert.equal(k.belumCair, 1_800_000);
  assert.equal(k.belumCairCount, 1);
  assert.equal(k.potensi, 1_300_000);
  assert.equal(k.potensiCount, 1);
  assert.deepEqual(k.breakdown.hemat, { count: 1, rate: 1_300_000, total: 1_300_000 });
  assert.deepEqual(k.breakdown.reguler, { count: 1, rate: 1_800_000, total: 1_800_000 });
});

test('computeUmrohKomisi only marks departed rows cair after lunas', () => {
  const k = computeUmrohKomisi([
    { paket: 'REGULER Quad', bayar: 5_000_000, sisa: 20_000_000, tgl_berangkat: '2026-06-01', diskon_marketing: 0 },
    { paket: 'HEMAT Triple', bayar: 30_000_000, sisa: 0, tgl_berangkat: '2026-06-01', diskon_marketing: 0 },
    { paket: 'REGULER Quad', bayar: 45_000_000, sisa: null, tgl_berangkat: '2026-06-01', diskon_marketing: 0 },
  ], '2026-06-20');

  assert.equal(k.totalKomisi, 4_900_000);
  assert.equal(k.sudahCair, 3_100_000);
  assert.equal(k.sudahCairCount, 2);
  assert.equal(k.belumCair, 0);
  assert.equal(k.potensi, 1_800_000);
  assert.equal(k.potensiCount, 1);

  const june = k.chartBulanan.find(row => row.bulan === '2026-06');
  assert.deepEqual(june, { bulan: '2026-06', total: 3_100_000, count: 2 });
});

test('computeUmrohKomisi treats departure day as already cair when lunas', () => {
  const k = computeUmrohKomisi([
    { paket: 'HEMAT Triple', bayar: 30_000_000, sisa: 0, tgl_berangkat: '2026-06-20', diskon_marketing: 0 },
  ], '2026-06-20');

  assert.equal(k.sudahCair, 1_300_000);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 0);

  const june = k.chartBulanan.find(row => row.bulan === '2026-06');
  assert.deepEqual(june, { bulan: '2026-06', total: 1_300_000, count: 1 });
});
