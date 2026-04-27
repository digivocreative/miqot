import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KOMISI_STAGE1,
  KOMISI_RATE_UHUD,
  KOMISI_RATE_RAHMAH,
  getHajiRate,
  computeKomisi,
  computeBreakdownTahun,
  computeAvailableYears,
  pickDefaultYear,
  computeByPaket,
} from '../lib/haji-stats.js';

test('constants: stage1=200, rateUhud=500, rateRahmah=750', () => {
  assert.equal(KOMISI_STAGE1, 200);
  assert.equal(KOMISI_RATE_UHUD, 500);
  assert.equal(KOMISI_RATE_RAHMAH, 750);
});

test('getHajiRate: RAHMAH paket → 750', () => {
  assert.equal(getHajiRate('Haji Plus RAHMAH'), 750);
  assert.equal(getHajiRate('rahmah'), 750);
  assert.equal(getHajiRate('RAHMAH 2027'), 750);
});

test('getHajiRate: UHUD paket → 500', () => {
  assert.equal(getHajiRate('Haji Plus UHUD'), 500);
  assert.equal(getHajiRate('uhud'), 500);
});

test('getHajiRate: unknown paket defaults to 500 (UHUD)', () => {
  assert.equal(getHajiRate(''), 500);
  assert.equal(getHajiRate(null), 500);
  assert.equal(getHajiRate(undefined), 500);
  assert.equal(getHajiRate('Haji Reguler'), 500);
});

test('computeKomisi: empty array returns zeros', () => {
  const k = computeKomisi([]);
  assert.deepEqual(k, {
    totalKomisi: 0,
    sudahCair: 0, sudahCairCount: 0,
    belumCair: 0, belumCairCount: 0,
    potensi: 0, potensiCount: 0,
  });
});

test('computeKomisi: LUNAS UHUD jamaah pays full $500 cair', () => {
  const k = computeKomisi([{ status_bayar: 'LUNAS', paket: 'UHUD' }]);
  assert.equal(k.sudahCair, 500);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 0);
  assert.equal(k.potensi, 0);
});

test('computeKomisi: LUNAS RAHMAH jamaah pays full $750 cair', () => {
  const k = computeKomisi([{ status_bayar: 'LUNAS', paket: 'RAHMAH' }]);
  assert.equal(k.sudahCair, 750);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 0);
});

test('computeKomisi: LEBIH BAYAR RAHMAH treated as LUNAS', () => {
  const k = computeKomisi([{ status_bayar: 'LEBIH BAYAR', paket: 'RAHMAH' }]);
  assert.equal(k.sudahCair, 750);
  assert.equal(k.sudahCairCount, 1);
});

test('computeKomisi: CICILAN UHUD pays $200 cair, $300 belum cair', () => {
  const k = computeKomisi([{ status_bayar: 'CICILAN', paket: 'UHUD' }]);
  assert.equal(k.sudahCair, 200);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 300);
  assert.equal(k.belumCairCount, 1);
  assert.equal(k.potensi, 0);
});

test('computeKomisi: CICILAN RAHMAH pays $200 cair, $550 belum cair', () => {
  const k = computeKomisi([{ status_bayar: 'CICILAN', paket: 'RAHMAH' }]);
  assert.equal(k.sudahCair, 200);
  assert.equal(k.belumCair, 550);
  assert.equal(k.belumCairCount, 1);
});

test('computeKomisi: BELUM BAYAR UHUD is potensi $500', () => {
  const k = computeKomisi([{ status_bayar: 'BELUM BAYAR', paket: 'UHUD' }]);
  assert.equal(k.potensi, 500);
  assert.equal(k.potensiCount, 1);
});

test('computeKomisi: BELUM BAYAR RAHMAH is potensi $750', () => {
  const k = computeKomisi([{ status_bayar: 'BELUM BAYAR', paket: 'RAHMAH' }]);
  assert.equal(k.potensi, 750);
  assert.equal(k.potensiCount, 1);
});

test('computeKomisi: null/undefined/missing/unknown status_bayar all treated as BELUM BAYAR', () => {
  const k = computeKomisi([
    { status_bayar: null },
    { status_bayar: undefined },
    { status_bayar: '' },
    { status_bayar: 'WEIRD_VALUE' },
    {}, // missing key entirely (Supabase projection edge case)
  ]);
  assert.equal(k.potensi, 2500);
  assert.equal(k.potensiCount, 5);
  assert.equal(k.sudahCair, 0);
});

test('computeKomisi: case-insensitive matching', () => {
  const k = computeKomisi([
    { status_bayar: 'lunas' },
    { status_bayar: 'Cicilan' },
    { status_bayar: 'belum bayar' },
  ]);
  assert.equal(k.sudahCair, 500 + 200);
  assert.equal(k.belumCair, 300);
  assert.equal(k.potensi, 500);
});

test('computeKomisi: mixed UHUD scenario (5 LUNAS, 3 CICILAN, 2 BELUM, 1 LEBIH BAYAR)', () => {
  const rows = [
    ...Array(5).fill({ status_bayar: 'LUNAS', paket: 'UHUD' }),
    ...Array(3).fill({ status_bayar: 'CICILAN', paket: 'UHUD' }),
    ...Array(2).fill({ status_bayar: 'BELUM BAYAR', paket: 'UHUD' }),
    { status_bayar: 'LEBIH BAYAR', paket: 'UHUD' },
  ];
  const k = computeKomisi(rows);
  assert.equal(k.sudahCair, 6 * 500 + 3 * 200);  // 3600
  assert.equal(k.sudahCairCount, 9);
  assert.equal(k.belumCair, 3 * 300);             // 900
  assert.equal(k.belumCairCount, 3);
  assert.equal(k.potensi, 2 * 500);                // 1000
  assert.equal(k.potensiCount, 2);
  assert.equal(k.totalKomisi, 5500);
  assert.equal(k.sudahCair + k.belumCair + k.potensi, k.totalKomisi);
});

test('computeKomisi: mixed paket (3 UHUD LUNAS, 2 RAHMAH LUNAS, 1 RAHMAH CICILAN)', () => {
  const rows = [
    ...Array(3).fill({ status_bayar: 'LUNAS', paket: 'UHUD' }),
    ...Array(2).fill({ status_bayar: 'LUNAS', paket: 'RAHMAH' }),
    { status_bayar: 'CICILAN', paket: 'RAHMAH' },
  ];
  const k = computeKomisi(rows);
  // sudahCair: 3×500 (UHUD LUNAS) + 2×750 (RAHMAH LUNAS) + 1×200 (RAHMAH CICILAN stage1) = 1500+1500+200 = 3200
  assert.equal(k.sudahCair, 3200);
  // belumCair: 1×550 (RAHMAH stage2 = 750-200) = 550
  assert.equal(k.belumCair, 550);
  // potensi: 0
  assert.equal(k.potensi, 0);
  // total: 3×500 + 3×750 = 1500 + 2250 = 3750
  assert.equal(k.totalKomisi, 3750);
});

test('computeBreakdownTahun: empty array returns empty', () => {
  assert.deepEqual(computeBreakdownTahun([]), []);
});

test('computeBreakdownTahun: groups by thn_masehi, sorted ASC', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
    { thn_masehi: '2027', status_bayar: 'CICILAN' },
    { thn_masehi: '2026', status_bayar: 'BELUM BAYAR' },
    { thn_masehi: '2028', status_bayar: 'LEBIH BAYAR' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b.length, 3);
  assert.equal(b[0].tahun, '2026');
  assert.equal(b[1].tahun, '2027');
  assert.equal(b[2].tahun, '2028');
});

test('computeBreakdownTahun: per-year counts and komisi', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
    { thn_masehi: '2027', status_bayar: 'CICILAN' },
    { thn_masehi: '2027', status_bayar: 'BELUM BAYAR' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b.length, 1);
  assert.equal(b[0].tahun, '2027');
  assert.equal(b[0].total, 4);
  assert.equal(b[0].lunas, 2);
  assert.equal(b[0].cicilan, 1);
  assert.equal(b[0].belumBayar, 1);
  // komisiCair = 2×500 + 1×200 = 1200
  assert.equal(b[0].komisiCair, 1200);
  // komisiTotal = 4 × 500 = 2000
  assert.equal(b[0].komisiTotal, 2000);
});

test('computeBreakdownTahun: LEBIH BAYAR counted as lunas', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LEBIH BAYAR' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b[0].lunas, 1);
  assert.equal(b[0].cicilan, 0);
  assert.equal(b[0].belumBayar, 0);
  assert.equal(b[0].komisiCair, 500);
});

test('computeBreakdownTahun: rows with null/invalid thn_masehi excluded', () => {
  const rows = [
    { thn_masehi: null, status_bayar: 'LUNAS' },
    { thn_masehi: '', status_bayar: 'LUNAS' },
    { thn_masehi: 'abc', status_bayar: 'LUNAS' },
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b.length, 1);
  assert.equal(b[0].tahun, '2027');
});

test('computeAvailableYears: dedupe + sort DESC + filter invalid', () => {
  const rows = [
    { thn_masehi: '2027' },
    { thn_masehi: '2027' },
    { thn_masehi: '2026' },
    { thn_masehi: '2030' },
    { thn_masehi: null },
    { thn_masehi: 'abc' },
    { thn_masehi: '' },
  ];
  assert.deepEqual(computeAvailableYears(rows), ['2030', '2027', '2026']);
});

test('computeAvailableYears: empty returns empty array', () => {
  assert.deepEqual(computeAvailableYears([]), []);
});

test('pickDefaultYear: empty/null returns null', () => {
  assert.equal(pickDefaultYear([], 2026), null);
  assert.equal(pickDefaultYear(null, 2026), null);
  assert.equal(pickDefaultYear(undefined, 2026), null);
});

test('pickDefaultYear: current year present → returns current year', () => {
  assert.equal(pickDefaultYear(['2030', '2027', '2026', '2025'], 2026), '2026');
});

test('pickDefaultYear: current year absent, only past years → closest past', () => {
  assert.equal(pickDefaultYear(['2024', '2025'], 2026), '2025');
});

test('pickDefaultYear: current year absent, only future years → closest future', () => {
  assert.equal(pickDefaultYear(['2027', '2028'], 2026), '2027');
});

test('pickDefaultYear: tie (past vs future at same distance) → prefer future', () => {
  assert.equal(pickDefaultYear(['2025', '2027'], 2026), '2027');
});

test('pickDefaultYear: distance wins over future-preference', () => {
  // 2024 is distance 2, 2030 is distance 4 → 2024 wins despite 2030 being future
  assert.equal(pickDefaultYear(['2024', '2030'], 2026), '2024');
});

test('pickDefaultYear: numeric currentYear works', () => {
  assert.equal(pickDefaultYear(['2026', '2027'], 2026), '2026');
});

test('pickDefaultYear: string currentYear works', () => {
  assert.equal(pickDefaultYear(['2026', '2027'], '2026'), '2026');
});

test('pickDefaultYear: single available year returned', () => {
  assert.equal(pickDefaultYear(['2030'], 2026), '2030');
});

test('computeBreakdownTahun: RAHMAH paket gets $750 rate', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS', paket: 'RAHMAH' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b[0].lunas, 1);
  assert.equal(b[0].komisiCair, 750);
  assert.equal(b[0].komisiTotal, 750);
});

test('computeBreakdownTahun: mixed UHUD+RAHMAH per year', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS', paket: 'UHUD' },
    { thn_masehi: '2027', status_bayar: 'LUNAS', paket: 'RAHMAH' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b[0].total, 2);
  assert.equal(b[0].lunas, 2);
  assert.equal(b[0].komisiCair, 500 + 750);
  assert.equal(b[0].komisiTotal, 500 + 750);
});

test('computeByPaket: empty returns 0/0', () => {
  assert.deepEqual(computeByPaket([]), { uhud: 0, rahmah: 0 });
});

test('computeByPaket: counts uhud and rahmah, others fall to uhud', () => {
  const rows = [
    { paket: 'UHUD' },
    { paket: 'Haji Plus UHUD' },
    { paket: 'RAHMAH' },
    { paket: 'rahmah lower' },
    { paket: 'Lainnya' },     // counts as uhud (default rate)
    { paket: null },           // counts as uhud
    {},                        // counts as uhud
  ];
  const r = computeByPaket(rows);
  assert.equal(r.uhud, 5);
  assert.equal(r.rahmah, 2);
});
