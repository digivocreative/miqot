import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAwapiRow } from '../awapi-client.js';

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
