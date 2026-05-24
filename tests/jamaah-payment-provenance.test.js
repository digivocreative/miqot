import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isAwapiPaymentSource,
  markLegacyPaymentRow,
  omitPaymentFieldsFromJamaahRow,
  prepareLegacyPaymentRowForUpsert,
  stampPaymentRaw,
} from '../lib/jamaah-payment-provenance.js';

function readServer() {
  return readFileSync(new URL('../server.js', import.meta.url), 'utf8');
}

test('stampPaymentRaw records source and timestamp inside raw_data', () => {
  const raw = stampPaymentRaw({ jm_id: 'JM1', bayar_gross: 5000000 }, 'legacy', '2026-05-24T01:02:03.000Z');

  assert.deepEqual(raw, {
    jm_id: 'JM1',
    bayar_gross: 5000000,
    payment_source: 'legacy',
    payment_synced_at: '2026-05-24T01:02:03.000Z',
  });
});

test('markLegacyPaymentRow keeps legacy payment fields and stamps provenance', () => {
  const row = markLegacyPaymentRow({
    nama: 'SITI',
    bayar: 5000000,
    sisa: 23900000,
    diskon_kantor: 0,
    diskon_marketing: 0,
    raw_data: { source: 'umrah_detail', bayar_gross: 5000000 },
  }, '2026-05-24T01:02:03.000Z');

  assert.equal(row.bayar, 5000000);
  assert.equal(row.sisa, 23900000);
  assert.equal(row.raw_data.payment_source, 'legacy');
  assert.equal(row.raw_data.payment_synced_at, '2026-05-24T01:02:03.000Z');
});

test('omitPaymentFieldsFromJamaahRow builds legacy enrichment-only payload for AWAPI-owned rows', () => {
  const row = omitPaymentFieldsFromJamaahRow({
    agent_id: 'agent-id',
    id_umroh: 'AIW0028864',
    jm_id: 'JM999999990000062962',
    nama: 'SITI KOMARIAH',
    wa: '628123',
    bayar: 5000000,
    sisa: 23900000,
    diskon_kantor: 0,
    diskon_marketing: 0,
    raw_data: {
      source: 'umrah_detail',
      bayar_gross: 5000000,
      harga_paket: 28900000,
      status_bayar: 'CICILAN',
      payment_source: 'legacy',
    },
  });

  assert.equal(row.nama, 'SITI KOMARIAH');
  assert.equal(row.wa, '628123');
  assert.equal(Object.hasOwn(row, 'bayar'), false);
  assert.equal(Object.hasOwn(row, 'sisa'), false);
  assert.equal(Object.hasOwn(row, 'diskon_kantor'), false);
  assert.equal(Object.hasOwn(row, 'diskon_marketing'), false);
  assert.equal(Object.hasOwn(row, 'raw_data'), false);
});

test('isAwapiPaymentSource detects AWAPI ownership from raw_data', () => {
  assert.equal(isAwapiPaymentSource({ raw_data: { payment_source: 'awapi' } }), true);
  assert.equal(isAwapiPaymentSource({ raw_data: { payment_source: 'legacy' } }), false);
  assert.equal(isAwapiPaymentSource({ payment_source: 'awapi' }), true);
});

test('prepareLegacyPaymentRowForUpsert only writes payment before AWAPI ownership', () => {
  const incoming = {
    nama: 'SITI',
    bayar: 5000000,
    sisa: 23900000,
    raw_data: { source: 'umrah_detail', bayar_gross: 5000000 },
  };

  const legacyAllowed = prepareLegacyPaymentRowForUpsert(incoming, null, '2026-05-24T01:02:03.000Z');
  assert.equal(legacyAllowed.bayar, 5000000);
  assert.equal(legacyAllowed.raw_data.payment_source, 'legacy');

  const enrichmentOnly = prepareLegacyPaymentRowForUpsert(incoming, {
    raw_data: { payment_source: 'awapi', payment_synced_at: '2026-05-24T01:00:00.000Z' },
  }, '2026-05-24T01:02:03.000Z');
  assert.equal(Object.hasOwn(enrichmentOnly, 'bayar'), false);
  assert.equal(Object.hasOwn(enrichmentOnly, 'sisa'), false);
  assert.equal(Object.hasOwn(enrichmentOnly, 'raw_data'), false);
});

test('server routes legacy umroh upserts through payment provenance guard', () => {
  const server = readServer();

  assert.match(server, /prepareLegacyPaymentRowsForUpsert/);
  assert.match(server, /prepareLegacyPaymentRowForUpsert\(merged, existing, timestamp\)/);
  assert.match(server, /splitLegacyRowsByPaymentPayload/);
  assert.match(server, /defaultToNull: false/);
});

test('scheduled Phase 2 enrichment remains payment-free', () => {
  const server = readServer();
  const start = server.indexOf('async function enrichJamaahFromLaporanItems');
  const end = server.indexOf('// Helper: build rows from parsed items');
  const snippet = server.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.doesNotMatch(snippet, /patch\.(bayar|sisa|diskon_kantor|diskon_marketing)\b/);
  assert.doesNotMatch(snippet, /raw_data/);
});
