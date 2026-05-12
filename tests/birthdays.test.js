import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBirthdaysForAgent } from '../lib/birthdays.js';

function jakartaDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function mockSupabase(rows) {
  const query = {
    select() { return this; },
    eq() { return this; },
    not() { return this; },
    async range(from) {
      return { data: from === 0 ? rows : [], error: null };
    },
  };
  return { from: () => query };
}

test('getBirthdaysForAgent skips current-year birth dates so age 0 never appears', async () => {
  const today = jakartaDateParts();
  const year = Number(today.year);
  const rows = [
    {
      id_umroh: 'AIW1',
      nama: 'VALID',
      jk: 'P',
      wa: '6281',
      paket: 'HEMAT',
      tgl_lahir: `${year - 48}-${today.month}-${today.day}`,
      bayar: 1,
      sisa: 0,
      tgl_berangkat: '2026-08-09',
    },
    {
      id_umroh: 'AIW2',
      nama: 'INVALID AGE ZERO',
      jk: 'L',
      wa: '6282',
      paket: 'UHUD',
      tgl_lahir: `${year}-${today.month}-${today.day}`,
      bayar: 0,
      sisa: 0,
      tgl_berangkat: '2026-07-04',
    },
  ];

  const birthdays = await getBirthdaysForAgent(mockSupabase(rows), 'agent-id', [0]);
  assert.equal(birthdays.length, 1);
  assert.equal(birthdays[0].nama, 'VALID');
  assert.equal(birthdays[0].age, 48);
});
