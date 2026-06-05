import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUpstreamLunas } from '../telegram-notifier.js';

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
