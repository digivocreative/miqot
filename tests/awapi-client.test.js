import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasSuspiciousAwapiPayment, normalizeAwapiRow } from '../awapi-client.js';

function jakartaYear() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).formatToParts(new Date());
  return Number(parts.find(p => p.type === 'year')?.value);
}

function rawRow(overrides = {}) {
  return {
    id_umrah: 'AIW0028902',
    id_jamaah: 'JM999999990000063096',
    nama: 'NANA RUKMANA',
    kelamin: 'laki-laki',
    hp: '62996093769',
    tgl_lahir: `${jakartaYear() - 48}-05-12`,
    paket: 'HEMAT',
    bayar: '5000000',
    bayar_sisa: 21500000,
    tgl_berangkat: `${jakartaYear()}-08-15`,
    tgl_daftar: `${jakartaYear()}-05-12 09:38:07`,
    paspor_nomor: '0',
    paspor_expired: '0000-00-00',
    ...overrides,
  };
}

test('normalizeAwapiRow keeps plausible birth dates', () => {
  const norm = normalizeAwapiRow(rawRow(), { agentId: 'agent-id' });
  assert.equal(norm.tgl_lahir, `${jakartaYear() - 48}-05-12`);
  assert.equal(norm.tgl_daftar, `${jakartaYear()}-05-12`);
  assert.equal(norm.tgl_berangkat, `${jakartaYear()}-08-15`);
});

test('normalizeAwapiRow nulls current-year birth dates from AWAPI placeholders', () => {
  const norm = normalizeAwapiRow(rawRow({ tgl_lahir: `${jakartaYear()}-05-12` }), { agentId: 'agent-id' });
  assert.equal(norm.tgl_lahir, null);
});

test('hasSuspiciousAwapiPayment flags negative sisa from inflated AWAPI bayar', () => {
  const norm = normalizeAwapiRow(rawRow({
    bayar: '101700000',
    bayar_sisa: -64300000,
  }), { agentId: 'agent-id' });

  assert.equal(hasSuspiciousAwapiPayment(norm), true);
});

test('hasSuspiciousAwapiPayment allows normal cicilan and lunas rows', () => {
  const cicilan = normalizeAwapiRow(rawRow({
    bayar: '4000000',
    bayar_sisa: 29300000,
  }), { agentId: 'agent-id' });
  const lunas = normalizeAwapiRow(rawRow({
    bayar: '33900000',
    bayar_sisa: 0,
  }), { agentId: 'agent-id' });

  assert.equal(hasSuspiciousAwapiPayment(cicilan), false);
  assert.equal(hasSuspiciousAwapiPayment(lunas), false);
});
