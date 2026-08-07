import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm', sourcemap: false });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('daftar sebutan berisi delapan pilihan dengan urutan tetap', async () => {
  const { SEBUTAN_LIST, SEBUTAN_OPTIONS } = await importTsModule('src/utils/sebutan.ts');
  assert.deepEqual(
    [...SEBUTAN_LIST],
    ['Bapak', 'Pak', 'Ibu', 'Bu', 'Bunda', 'Kak', 'Mas', 'Mba'],
  );
  assert.equal(SEBUTAN_OPTIONS.length, 8);
  assert.deepEqual(SEBUTAN_OPTIONS[0], { value: 'Bapak', label: 'Bapak' });
  assert.deepEqual(SEBUTAN_OPTIONS.at(-1), { value: 'Mba', label: 'Mba' });
});

test('salutation bawaan server tetap sebutan yang sah', async () => {
  // lib/birthdays.js:73 mengirim 'Ibu'/'Bapak' dan itulah nilai awal dropdown.
  const { isSebutan } = await importTsModule('src/utils/sebutan.ts');
  assert.equal(isSebutan('Bapak'), true);
  assert.equal(isSebutan('Ibu'), true);
  assert.equal(isSebutan('Tuan'), false);
  assert.equal(isSebutan(''), false);
});

test('sebutan terpilih dipakai di sapaan pembuka dan kalimat doa', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage(
    { nama: 'FULAN BIN FULAN', age: 40, day_offset: 0 },
    'Bagas Pramudita',
    'Bunda',
  );
  assert.equal(msg.match(/Bunda Fulan/g).length, 2);
  assert.match(msg, /\*Barakallahu fii umrik, Bunda Fulan!\*/);
  assert.match(msg, /usia ke-40 ini/);
  assert.ok(!/\b(Pak|Bapak|Ibu|Bu)\b/.test(msg), 'sebutan lama tidak boleh tersisa');
});

test('pesan H-n memakai sebutan yang sama dan hitungan hari yang benar', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage(
    { nama: 'siti aminah', age: 35, day_offset: 2 },
    'Bagas',
    'Kak',
  );
  assert.match(msg, /\*Kak Siti\*, _2 hari lagi_ ulang tahun ya\./);
  assert.equal(msg.match(/Kak Siti/g).length, 2);
  assert.match(msg, /usia ke-35 nanti/);
});

test('H-1 memakai kata "besok", bukan "1 hari lagi"', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage({ nama: 'Budi', age: 50, day_offset: 1 }, 'Bagas', 'Pak');
  assert.match(msg, /_besok_ ulang tahun ya\./);
  assert.ok(!msg.includes('1 hari lagi'));
});

test('nama agen kosong jatuh ke kata "Saya", tanda tangan tetap dirender', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage({ nama: 'Budi', age: 50, day_offset: 0 }, '', 'Mas');
  assert.match(msg, /Saya ikut mendoakan/);
  assert.match(msg, /_Alhijaz Indowisata_$/);
});
