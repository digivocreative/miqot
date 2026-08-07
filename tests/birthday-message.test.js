import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { buildSync } from 'esbuild';

// Bundling, bukan transform: birthdayMessage.ts mengimpor ./sebutan saat
// runtime, dan impor relatif tidak bisa di-resolve dari data: URL.
async function importTsModule(path) {
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(new URL(`../${path}`, import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const code = outputFiles[0].text;
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

test('daftar gelar berisi tiga pilihan, kosong berlabel em-dash', async () => {
  const { GELAR_LIST, GELAR_OPTIONS, isGelar } = await importTsModule('src/utils/sebutan.ts');
  assert.deepEqual([...GELAR_LIST], ['', 'H.', 'Hj.']);
  assert.deepEqual(GELAR_OPTIONS[0], { value: '', label: '—' });
  assert.deepEqual(GELAR_OPTIONS[1], { value: 'H.', label: 'H.' });
  assert.deepEqual(GELAR_OPTIONS[2], { value: 'Hj.', label: 'Hj.' });
  assert.equal(isGelar('Hj.'), true);
  assert.equal(isGelar(''), true);
  assert.equal(isGelar('Dr.'), false);
});

test('formatSapaan menyisipkan gelar hanya bila ada', async () => {
  const { formatSapaan } = await importTsModule('src/utils/sebutan.ts');
  assert.equal(formatSapaan('Bapak', 'H.'), 'Bapak H.');
  assert.equal(formatSapaan('Bunda', 'Hj.'), 'Bunda Hj.');
  assert.equal(formatSapaan('Bapak', ''), 'Bapak');
});

test('gelar yang menempel di nama dipisahkan dan dinormalkan', async () => {
  const { splitGelarFromNama } = await importTsModule('src/utils/sebutan.ts');
  // Keempat bentuk ini nyata ada di tabel jamaah (probe 2026-08-07, 5.397 baris).
  assert.deepEqual(splitGelarFromNama('H. KHAERUL, IR  . .'), { gelar: 'H.', nama: 'KHAERUL, IR  . .' });
  assert.deepEqual(splitGelarFromNama('HJ. SITTI MARWAH HAMID, IR . .'), { gelar: 'Hj.', nama: 'SITTI MARWAH HAMID, IR . .' });
  assert.deepEqual(splitGelarFromNama('H.M.IQBAL ALAMSYAH'), { gelar: 'H.', nama: 'M.IQBAL ALAMSYAH' });
  assert.deepEqual(splitGelarFromNama('HJ TITIN'), { gelar: 'Hj.', nama: 'TITIN' });
  assert.deepEqual(splitGelarFromNama('Haji Sulaeman'), { gelar: 'H.', nama: 'Sulaeman' });
  assert.deepEqual(splitGelarFromNama('HAJAH ROHIMAH'), { gelar: 'Hj.', nama: 'ROHIMAH' });
});

test('nama biasa yang kebetulan berawalan H tidak boleh terpotong', async () => {
  const { splitGelarFromNama } = await importTsModule('src/utils/sebutan.ts');
  for (const nama of ['HASAN BASRI', 'HENDRA', 'Hj', 'HAJIJAH SARI', 'FULAN BIN FULAN', '']) {
    assert.deepEqual(splitGelarFromNama(nama), { gelar: '', nama }, `tidak boleh dipotong: ${nama}`);
  }
});

test('hanya satu awalan gelar yang dibuang', async () => {
  const { splitGelarFromNama } = await importTsModule('src/utils/sebutan.ts');
  assert.deepEqual(splitGelarFromNama('H. H. KHAERUL'), { gelar: 'H.', nama: 'H. KHAERUL' });
});

test('pesan untuk jamaah bergelar tidak lagi berbunyi "Bapak H."', async () => {
  const { getBirthdayMessage } = await importTsModule('src/utils/birthdayMessage.ts');
  const msg = getBirthdayMessage({ nama: 'HJ TITIN', age: 60, day_offset: 0 }, 'Bagas', 'Ibu Hj.');
  assert.equal(msg.match(/Ibu Hj\. Titin/g).length, 2);
  assert.ok(!/Hj\.\s*Hj\./.test(msg), 'gelar tidak boleh dobel');
});
