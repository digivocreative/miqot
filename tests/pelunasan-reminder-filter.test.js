import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUpstreamLunas, hasAggregateBayarShape, bookingProvenOutstanding } from '../telegram-notifier.js';

// Mitigasi guard-bug (2026-06-05): pelunasanReminder harus skip row yang kolom
// `sisa`-nya stuck >0 padahal payload AWAPI terakhir sudah melaporkan lunas.
// PostgREST mengembalikan alias raw_data->>'...' sebagai TEXT, jadi
// awapi_bayar_sisa datang sebagai string.

test('isUpstreamLunas skips rows whose upstream status reports lunas', () => {
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'LUNAS' }), true);
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'LEBIH BAYAR' }), true);
  // Whitespace/case noise from upstream must not defeat the filter.
  assert.equal(isUpstreamLunas({ awapi_bayar_status: ' LUNAS ' }), true);
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'LEBIH  BAYAR' }), true);
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'lebih bayar' }), true);
});

test('isUpstreamLunas skips rows whose upstream sisa is negative (aggregate booking shape)', () => {
  // Production victim shape: status LEBIH BAYAR + bayar_sisa negatif (TEXT).
  assert.equal(isUpstreamLunas({ awapi_bayar_status: null, awapi_bayar_sisa: '-69800000' }), true);
  assert.equal(isUpstreamLunas({ awapi_bayar_sisa: -34900000 }), true);
});

test('isUpstreamLunas keeps genuinely outstanding rows', () => {
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'CICILAN', awapi_bayar_sisa: '29300000' }), false);
  assert.equal(isUpstreamLunas({ awapi_bayar_status: 'BELUM BAYAR' }), false);
  // Legacy umrah_detail rows have no bayar_status/bayar_sisa in raw_data —
  // they must stay in the reminder.
  assert.equal(isUpstreamLunas({ awapi_bayar_status: null, awapi_bayar_sisa: null }), false);
  assert.equal(isUpstreamLunas({}), false);
  // Garbage values must not accidentally skip a reminder.
  assert.equal(isUpstreamLunas({ awapi_bayar_sisa: 'abc' }), false);
  assert.equal(isUpstreamLunas({ awapi_bayar_sisa: '' }), false);
  assert.equal(isUpstreamLunas({ awapi_bayar_sisa: '0' }), false);
});

test('hasAggregateBayarShape flags only negative upstream bayar_sisa', () => {
  // PostgREST returns raw_data->>'...' aliases as TEXT.
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: '-25900000' }), true);
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: -13900000 }), true);
  // Clean per-pax LUNAS rows (sisa 0/positive/missing) are not the aggregate
  // shape — their lunas claim is trustworthy without booking math.
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: '0' }), false);
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: '29300000' }), false);
  assert.equal(hasAggregateBayarShape({ awapi_bayar_sisa: null }), false);
  assert.equal(hasAggregateBayarShape({}), false);
});

test('bookingProvenOutstanding proves partially-paid multi-pax bookings outstanding', () => {
  // Production case AIW0027949 (widi, verified upstream 2026-06-06): 2 pax at
  // 46.9jt, booking aggregate 72.8jt — AWAPI claims LEBIH BAYAR but 21jt is
  // genuinely outstanding. The reminder must keep firing.
  const widi = [
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
  ];
  assert.equal(bookingProvenOutstanding(widi), true);

  // Production case AIW0029071 (TEJO, 1 pax overpaid): aggregate covers the
  // booking price → really lunas, suppression is correct.
  const tejo = [{ awapi_paket_harga: '33900000', awapi_bayar: '47800000' }];
  assert.equal(bookingProvenOutstanding(tejo), false);

  // Fully-paid 3-pax aggregate booking (yenita shape) → not outstanding.
  const yenita = [
    { awapi_paket_harga: '34900000', awapi_bayar: '104700000' },
    { awapi_paket_harga: '34900000', awapi_bayar: '104700000' },
    { awapi_paket_harga: '34900000', awapi_bayar: '104700000' },
  ];
  assert.equal(bookingProvenOutstanding(yenita), false);
});

test('bookingProvenOutstanding stays conservative when the proof is incomputable', () => {
  // False reminders are the original incident — unprovable bookings suppress.
  assert.equal(bookingProvenOutstanding([]), false);
  assert.equal(bookingProvenOutstanding(null), false);
  assert.equal(bookingProvenOutstanding(undefined), false);
  // A pax with a missing/garbage price makes Σ paket_harga an undercount.
  assert.equal(bookingProvenOutstanding([
    { awapi_paket_harga: '46900000', awapi_bayar: '72800000' },
    { awapi_paket_harga: null, awapi_bayar: '72800000' },
  ]), false);
  assert.equal(bookingProvenOutstanding([
    { awapi_paket_harga: 'abc', awapi_bayar: '72800000' },
  ]), false);
});
