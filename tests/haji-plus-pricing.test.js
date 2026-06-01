import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_ESCALATION_RATE,
  KURS_INFLATION_RATE,
  computeHajiPlusEscalation,
  condenseLadder,
} from '../src/lib/hajiPlusPricing.js';

const baseInput = {
  basePriceUSD: 15700,
  jumlahJamaah: 1,
  tahunBerangkat: 2036,
  currentYear: 2026,
  kursUSD: 15500,
  dpPerJamaahUSD: 4500,
};

test('rates are the agreed constants', () => {
  assert.equal(PRICE_ESCALATION_RATE, 0.025);
  assert.equal(KURS_INFLATION_RATE, 0.015);
});

test('escalates the package price ~2.5%/yr to the departure year', () => {
  const r = computeHajiPlusEscalation(baseInput);
  assert.equal(r.years, 10);
  assert.ok(Math.abs(r.escalatedPriceUSD - 20097.33) < 1, `got ${r.escalatedPriceUSD}`);
  assert.equal(r.escalatedTotalUSD, r.escalatedPriceUSD * 1);
  assert.equal(r.baseTotalUSD, 15700);
});

test('floors years at 1 for a current/past departure year', () => {
  const r = computeHajiPlusEscalation({ ...baseInput, tahunBerangkat: 2026 });
  assert.equal(r.years, 1);
  assert.equal(r.ladder.length, 2);
  assert.equal(r.ladder[1].year, 2026);        // departure label pinned to tahunBerangkat
  assert.equal(r.ladder[1].isDeparture, true);
});

test('DP is fixed and sisa is the escalated remainder', () => {
  const r = computeHajiPlusEscalation({ ...baseInput, jumlahJamaah: 2 });
  assert.equal(r.dpUSD, 9000);
  assert.equal(r.sisaUSD, r.escalatedTotalUSD - 9000);
});

test('IDR applies both kurs inflation and escalation; DP stays at today kurs', () => {
  const r = computeHajiPlusEscalation(baseInput);
  const expectedKurs = 15500 * Math.pow(1.015, 10);
  assert.ok(Math.abs(r.inflatedKurs - expectedKurs) < 1e-6);
  assert.ok(Math.abs(r.estTotalIDR - r.escalatedTotalUSD * expectedKurs) < 1e-3);
  assert.equal(r.dpIDR, 4500 * 15500);
  assert.ok(Math.abs(r.sisaIDR - r.sisaUSD * r.inflatedKurs) < 1e-3);
});

test('ladder spans now to departure, strictly increasing, last flagged', () => {
  const r = computeHajiPlusEscalation(baseInput);
  assert.equal(r.ladder.length, 11);
  assert.deepEqual(r.ladder[0], { year: 2026, priceUSD: 15700, isDeparture: false });
  const last = r.ladder[r.ladder.length - 1];
  assert.equal(last.year, 2036);
  assert.equal(last.isDeparture, true);
  assert.ok(Math.abs(last.priceUSD - r.escalatedPriceUSD) < 1e-6);
  for (let i = 1; i < r.ladder.length; i++) {
    assert.ok(r.ladder[i].priceUSD > r.ladder[i - 1].priceUSD);
  }
});

test('condenseLadder keeps at most 5 rows incl. first and last with departure flag', () => {
  const r = computeHajiPlusEscalation(baseInput); // 11 rows (2026..2036)
  const rows = condenseLadder(r.ladder, 5);
  assert.ok(rows.length <= 5);
  assert.equal(rows[0].year, 2026);
  assert.equal(rows[rows.length - 1].year, 2036);
  assert.equal(rows[rows.length - 1].isDeparture, true);
});

test('condenseLadder returns every row when already within the cap', () => {
  const r = computeHajiPlusEscalation({ ...baseInput, tahunBerangkat: 2029 }); // 4 rows
  assert.equal(condenseLadder(r.ladder, 5).length, 4);
});
