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
  computeBerangkatStats,
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

test('computeKomisi: LUNAS UHUD without SUDAH BERANGKAT pays only $200 stage1', () => {
  const k = computeKomisi([{ status_bayar: 'LUNAS', paket_detail: 'UHUD' }]);
  assert.equal(k.sudahCair, 200);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 300);
  assert.equal(k.belumCairCount, 1);
});

test('computeKomisi: LUNAS UHUD + SUDAH BERANGKAT → full $500 cair', () => {
  const k = computeKomisi([{ status_bayar: 'LUNAS', paket_detail: 'UHUD', status_berangkat: 'SUDAH BERANGKAT' }]);
  assert.equal(k.sudahCair, 500);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 0);
  assert.equal(k.belumCairCount, 0);
});

test('computeKomisi: LUNAS RAHMAH without SUDAH BERANGKAT pays only $200 stage1', () => {
  const k = computeKomisi([{ status_bayar: 'LUNAS', paket_detail: 'RAHMAH' }]);
  assert.equal(k.sudahCair, 200);
  assert.equal(k.belumCair, 550);
  assert.equal(k.belumCairCount, 1);
});

test('computeKomisi: LUNAS RAHMAH + SUDAH BERANGKAT → full $750 cair', () => {
  const k = computeKomisi([{ status_bayar: 'LUNAS', paket_detail: 'RAHMAH', status_berangkat: 'SUDAH BERANGKAT' }]);
  assert.equal(k.sudahCair, 750);
  assert.equal(k.belumCair, 0);
});

test('computeKomisi: LEBIH BAYAR + SUDAH BERANGKAT (RAHMAH) → full $750 cair', () => {
  const k = computeKomisi([{ status_bayar: 'LEBIH BAYAR', paket_detail: 'RAHMAH', status_berangkat: 'SUDAH BERANGKAT' }]);
  assert.equal(k.sudahCair, 750);
  assert.equal(k.sudahCairCount, 1);
});

test('computeKomisi: CICILAN UHUD (not departed) pays $200 cair, $300 belum cair', () => {
  const k = computeKomisi([{ status_bayar: 'CICILAN', paket_detail: 'UHUD' }]);
  assert.equal(k.sudahCair, 200);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 300);
  assert.equal(k.belumCairCount, 1);
  assert.equal(k.potensi, 0);
});

test('computeKomisi: CICILAN UHUD + SUDAH BERANGKAT → full $500 cair', () => {
  const k = computeKomisi([{ status_bayar: 'CICILAN', paket_detail: 'UHUD', status_berangkat: 'SUDAH BERANGKAT' }]);
  assert.equal(k.sudahCair, 500);
  assert.equal(k.belumCair, 0);
  assert.equal(k.belumCairCount, 0);
});

test('computeKomisi: CICILAN RAHMAH (not departed) pays $200 cair, $550 belum cair', () => {
  const k = computeKomisi([{ status_bayar: 'CICILAN', paket_detail: 'RAHMAH' }]);
  assert.equal(k.sudahCair, 200);
  assert.equal(k.belumCair, 550);
  assert.equal(k.belumCairCount, 1);
});

test('computeKomisi: BELUM BAYAR UHUD is potensi $500 regardless of berangkat', () => {
  const k = computeKomisi([{ status_bayar: 'BELUM BAYAR', paket_detail: 'UHUD' }]);
  assert.equal(k.potensi, 500);
  assert.equal(k.potensiCount, 1);

  const k2 = computeKomisi([{ status_bayar: 'BELUM BAYAR', paket_detail: 'UHUD', status_berangkat: 'SUDAH BERANGKAT' }]);
  assert.equal(k2.potensi, 500);
  assert.equal(k2.sudahCair, 0);
});

test('computeKomisi: BELUM BAYAR RAHMAH is potensi $750', () => {
  const k = computeKomisi([{ status_bayar: 'BELUM BAYAR', paket_detail: 'RAHMAH' }]);
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

test('computeKomisi: case-insensitive matching of all status fields', () => {
  const k = computeKomisi([
    { status_bayar: 'lunas', status_berangkat: 'sudah berangkat' },
    { status_bayar: 'Cicilan' },
    { status_bayar: 'belum bayar' },
  ]);
  // 1 LUNAS+departed UHUD = $500
  // 1 CICILAN UHUD not departed = $200 cair, $300 belum
  // 1 BELUM BAYAR UHUD = $500 potensi
  assert.equal(k.sudahCair, 500 + 200);
  assert.equal(k.belumCair, 300);
  assert.equal(k.potensi, 500);
});

test('computeKomisi: mixed UHUD scenario, none departed', () => {
  const rows = [
    ...Array(5).fill({ status_bayar: 'LUNAS', paket_detail: 'UHUD' }),
    ...Array(3).fill({ status_bayar: 'CICILAN', paket_detail: 'UHUD' }),
    ...Array(2).fill({ status_bayar: 'BELUM BAYAR', paket_detail: 'UHUD' }),
    { status_bayar: 'LEBIH BAYAR', paket_detail: 'UHUD' },
  ];
  const k = computeKomisi(rows);
  // Paid (5+3+1=9) × stage1 $200 = 1800
  assert.equal(k.sudahCair, 9 * 200);
  assert.equal(k.sudahCairCount, 9);
  // Each paid jamaah has $300 belum cair
  assert.equal(k.belumCair, 9 * 300);
  assert.equal(k.belumCairCount, 9);
  // Belum bayar 2 × $500 = 1000
  assert.equal(k.potensi, 1000);
  assert.equal(k.potensiCount, 2);
  assert.equal(k.totalKomisi, 5500);
  assert.equal(k.sudahCair + k.belumCair + k.potensi, k.totalKomisi);
});

test('computeKomisi: mixed UHUD scenario, all paid jamaah departed', () => {
  const rows = [
    ...Array(5).fill({ status_bayar: 'LUNAS', paket_detail: 'UHUD', status_berangkat: 'SUDAH BERANGKAT' }),
    ...Array(3).fill({ status_bayar: 'CICILAN', paket_detail: 'UHUD', status_berangkat: 'SUDAH BERANGKAT' }),
    ...Array(2).fill({ status_bayar: 'BELUM BAYAR', paket_detail: 'UHUD' }),
    { status_bayar: 'LEBIH BAYAR', paket_detail: 'UHUD', status_berangkat: 'SUDAH BERANGKAT' },
  ];
  const k = computeKomisi(rows);
  // 9 paid × full $500 = 4500
  assert.equal(k.sudahCair, 9 * 500);
  assert.equal(k.sudahCairCount, 9);
  assert.equal(k.belumCair, 0);
  assert.equal(k.belumCairCount, 0);
  // 2 belum bayar × $500 = 1000
  assert.equal(k.potensi, 1000);
  assert.equal(k.totalKomisi, 5500);
});

test('computeKomisi: mixed paket none departed', () => {
  const rows = [
    ...Array(3).fill({ status_bayar: 'LUNAS', paket_detail: 'UHUD' }),
    ...Array(2).fill({ status_bayar: 'LUNAS', paket_detail: 'RAHMAH' }),
    { status_bayar: 'CICILAN', paket_detail: 'RAHMAH' },
  ];
  const k = computeKomisi(rows);
  // 6 paid × $200 = 1200
  assert.equal(k.sudahCair, 1200);
  assert.equal(k.sudahCairCount, 6);
  // belum cair: 3 UHUD × 300 + 3 RAHMAH × 550 = 900 + 1650 = 2550
  assert.equal(k.belumCair, 900 + 1650);
  assert.equal(k.belumCairCount, 6);
  assert.equal(k.potensi, 0);
  // total: 3×500 + 3×750 = 1500 + 2250 = 3750
  assert.equal(k.totalKomisi, 3750);
});

test('computeKomisi: mixed paket, partial departure', () => {
  const rows = [
    { status_bayar: 'LUNAS', paket_detail: 'UHUD', status_berangkat: 'SUDAH BERANGKAT' },
    { status_bayar: 'LUNAS', paket_detail: 'RAHMAH', status_berangkat: 'SUDAH BERANGKAT' },
    { status_bayar: 'LUNAS', paket_detail: 'UHUD' },                                       // not departed
    { status_bayar: 'CICILAN', paket_detail: 'RAHMAH' },                                    // not departed
  ];
  const k = computeKomisi(rows);
  // sudahCair: 1×500 (UHUD departed) + 1×750 (RAHMAH departed) + 1×200 (UHUD stage1) + 1×200 (RAHMAH stage1) = 500+750+200+200 = 1650
  assert.equal(k.sudahCair, 1650);
  assert.equal(k.sudahCairCount, 4);
  // belumCair: 1×300 (UHUD stage2) + 1×550 (RAHMAH stage2) = 850
  assert.equal(k.belumCair, 850);
  assert.equal(k.belumCairCount, 2);
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

test('computeBreakdownTahun: per-year counts and komisi (none departed)', () => {
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
  assert.equal(b[0].sudahBerangkat, 0);
  // 3 paid × $200 stage1 = 600
  assert.equal(b[0].komisiCair, 600);
  // 4 × $500 = 2000
  assert.equal(b[0].komisiTotal, 2000);
});

test('computeBreakdownTahun: per-year counts with departure', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS', status_berangkat: 'SUDAH BERANGKAT' },
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b[0].lunas, 2);
  assert.equal(b[0].sudahBerangkat, 1);
  // 1 departed × $500 + 1 not departed × $200 = 700
  assert.equal(b[0].komisiCair, 700);
});

test('computeBreakdownTahun: LEBIH BAYAR counted as lunas, departure-gated cair', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LEBIH BAYAR' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b[0].lunas, 1);
  assert.equal(b[0].cicilan, 0);
  assert.equal(b[0].belumBayar, 0);
  // not departed → only stage1 cair
  assert.equal(b[0].komisiCair, 200);
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

test('computeBreakdownTahun: RAHMAH paket departed gets $750 cair', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS', paket_detail: 'RAHMAH', status_berangkat: 'SUDAH BERANGKAT' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b[0].lunas, 1);
  assert.equal(b[0].sudahBerangkat, 1);
  assert.equal(b[0].komisiCair, 750);
  assert.equal(b[0].komisiTotal, 750);
});

test('computeBreakdownTahun: mixed UHUD+RAHMAH all departed', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS', paket_detail: 'UHUD', status_berangkat: 'SUDAH BERANGKAT' },
    { thn_masehi: '2027', status_bayar: 'LUNAS', paket_detail: 'RAHMAH', status_berangkat: 'SUDAH BERANGKAT' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b[0].total, 2);
  assert.equal(b[0].lunas, 2);
  assert.equal(b[0].sudahBerangkat, 2);
  assert.equal(b[0].komisiCair, 500 + 750);
  assert.equal(b[0].komisiTotal, 500 + 750);
});

test('computeByPaket: empty returns zeros', () => {
  assert.deepEqual(computeByPaket([]), { uhud: 0, rahmah: 0, standar: 0, unknown: 0 });
});

test('computeByPaket: counts uhud, rahmah, standar, and unknown', () => {
  const rows = [
    { paket_detail: 'UHUD Quard' },
    { paket_detail: 'Haji Plus UHUD' },     // contains "uhud" → uhud
    { paket_detail: 'RAHMAH Double' },
    { paket_detail: 'rahmah lower' },
    { paket_detail: 'STANDAR Double' },      // standar bucket
    { paket_detail: 'standar' },             // standar bucket (case-insensitive)
    { paket_detail: 'Lainnya' },             // unrecognized → uhud (matches default rate)
    { paket_detail: null },                  // unknown
    { paket_detail: '' },                    // unknown
    {},                                       // missing key → unknown
  ];
  const r = computeByPaket(rows);
  assert.equal(r.uhud, 3);     // 2 UHUD + Lainnya (default bucket)
  assert.equal(r.rahmah, 2);
  assert.equal(r.standar, 2);
  assert.equal(r.unknown, 3);  // null + '' + missing
});

test('computeBerangkatStats: empty returns 0/0', () => {
  assert.deepEqual(computeBerangkatStats([]), { sudahBerangkat: 0, belumBerangkat: 0 });
});

test('computeBerangkatStats: counts SUDAH BERANGKAT (case-insensitive)', () => {
  const rows = [
    { status_berangkat: 'SUDAH BERANGKAT' },
    { status_berangkat: 'sudah berangkat' },
    { status_berangkat: 'BELUM BERANGKAT' },
    { status_berangkat: null },
    { status_berangkat: '' },
    {},
  ];
  const r = computeBerangkatStats(rows);
  assert.equal(r.sudahBerangkat, 2);
  assert.equal(r.belumBerangkat, 4);
});
