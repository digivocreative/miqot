import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPaymentRepresentationAnomalies } from '../lib/jamaah-sync-health.js';

// Helper: a pax row as projected from the DB for the invariant check.
function row(o) {
  return {
    jm_id: o.jm_id || 'JM1',
    id_umroh: o.id_umroh || 'AIW1',
    nama: o.nama || 'X',
    bayar: o.bayar ?? 0,
    sisa: o.sisa ?? 0,
    raw_bayar: o.raw_bayar ?? null,
    raw_bayar_sisa: o.raw_bayar_sisa ?? null,
    raw_paket_harga: o.raw_paket_harga ?? null,
    payment_guard: o.payment_guard ?? null,
  };
}

test('findPaymentRepresentationAnomalies flags false-unpaid (booking paid but row bayar=0)', () => {
  // AIW0028669 zeroed shape: raw aggregate present, DB column zeroed.
  const rows = [1, 2, 3].map(i => row({
    jm_id: `JM${i}`, id_umroh: 'AIW0028669',
    bayar: 0, sisa: 34900000,
    raw_bayar: '69800000', raw_bayar_sisa: -34900000, raw_paket_harga: '34900000',
  }));
  const r = findPaymentRepresentationAnomalies(rows);
  assert.equal(r.falseUnpaidCount, 3);
  assert.equal(r.clean, false);
});

test('findPaymentRepresentationAnomalies flags false-lunas (partial booking shown lunas)', () => {
  // 4 pax @37.8jt, aggregate 75.6jt (2/4 paid) but all rows stored sisa=0/lunas.
  const rows = [1, 2, 3, 4].map(i => row({
    jm_id: `JM${i}`, id_umroh: 'AIW0024369',
    bayar: 37800000, sisa: 0,
    raw_bayar: '75600000', raw_bayar_sisa: -37800000, raw_paket_harga: '37800000',
  }));
  const r = findPaymentRepresentationAnomalies(rows);
  assert.equal(r.falseLunasCount, 4);
  assert.equal(r.falseUnpaidCount, 0);
});

test('findPaymentRepresentationAnomalies is clean for correctly allocated partial rows', () => {
  // Proportional allocation: bayar>0, sisa>0, raw aggregate negative.
  const rows = [1, 2, 3].map(i => row({
    jm_id: `JM${i}`, id_umroh: 'AIW0028669',
    bayar: 23266666, sisa: 11633334,
    raw_bayar: '69800000', raw_bayar_sisa: -34900000, raw_paket_harga: '34900000',
  }));
  assert.equal(findPaymentRepresentationAnomalies(rows).clean, true);
});

test('findPaymentRepresentationAnomalies skips multi-subgroup and respects manual-confirm', () => {
  // Multi-subgroup (2 distinct aggregates) → not evaluated for false-lunas.
  const multisub = [
    row({ jm_id: 'JM1', id_umroh: 'AIW2', bayar: 28000000, sisa: 0, raw_bayar: '56000000', raw_bayar_sisa: -28000000, raw_paket_harga: '28000000' }),
    row({ jm_id: 'JM2', id_umroh: 'AIW2', bayar: 33800000, sisa: 0, raw_bayar: '33800000', raw_bayar_sisa: -33800000, raw_paket_harga: '33800000' }),
  ];
  assert.equal(findPaymentRepresentationAnomalies(multisub).falseLunasCount, 0);

  // Manual-confirmed lunas pax in a partial booking is NOT a false-lunas.
  const manual = [
    row({ jm_id: 'JM1', id_umroh: 'AIW3', bayar: 34900000, sisa: 0, raw_bayar: '69800000', raw_bayar_sisa: -34900000, raw_paket_harga: '34900000', payment_guard: 'manual_confirmed_lunas_after_awapi_anomaly' }),
    row({ jm_id: 'JM2', id_umroh: 'AIW3', bayar: 17450000, sisa: 17450000, raw_bayar: '69800000', raw_bayar_sisa: -34900000, raw_paket_harga: '34900000' }),
    row({ jm_id: 'JM3', id_umroh: 'AIW3', bayar: 17450000, sisa: 17450000, raw_bayar: '69800000', raw_bayar_sisa: -34900000, raw_paket_harga: '34900000' }),
  ];
  assert.equal(findPaymentRepresentationAnomalies(manual).clean, true);
});
