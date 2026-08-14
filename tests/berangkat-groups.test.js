import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBerangkatGroups, getDestinationFlags, cleanTourLeader, realDateKey, fmtTglHari,
} from '../lib/berangkat-groups.js';

test('buildBerangkatGroups mengelompokkan item dengan jadwal_id yang sama', () => {
  const items = [
    { nama: 'A', paket: 'UMROH REGULER', jadwal_id: 'J1', tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
    { nama: 'B', paket: 'UMROH REGULER', jadwal_id: 'J1', tgl_berangkat: '2026-08-05', jk: 'P', hari_lagi: 2, lunas: false, sisa: 5000000, wa: null },
  ];

  const result = buildBerangkatGroups(items);

  assert.equal(result.length, 1);
  assert.equal(result[0].count, 2);
});

test('buildBerangkatGroups mengekspos jadwal_id dan itinerary_ready sebagai field grup', () => {
  // Dipakai menyusun link share /:slug/:jadwalId/itinerary di detail grup —
  // `key` tak bisa dipakai karena bisa berupa kunci gabungan.
  const items = [
    { nama: 'A', paket: 'UMROH REGULER', jadwal_id: 'J1', itinerary_ready: true, tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
  ];

  const [group] = buildBerangkatGroups(items);

  assert.equal(group.jadwal_id, 'J1');
  assert.equal(group.itinerary_ready, true);
});

test('buildBerangkatGroups memberi jadwal_id null dan itinerary_ready false pada grup berkunci gabungan', () => {
  const items = [
    { nama: 'A', paket: 'PAKET X', jadwal_id: null, berangkat_kode_penerbangan: 'SV821', tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
  ];

  const [group] = buildBerangkatGroups(items);

  assert.notEqual(group.key, null);
  assert.equal(group.jadwal_id, null);
  assert.equal(group.itinerary_ready, false);
});

test('buildBerangkatGroups memakai kunci gabungan paket|tgl|kode saat jadwal_id null, paket berbeda tidak menyatu', () => {
  const items = [
    { nama: 'A', paket: 'PAKET X', jadwal_id: null, berangkat_kode_penerbangan: 'SV821', tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
    { nama: 'B', paket: 'PAKET Y', jadwal_id: null, berangkat_kode_penerbangan: 'SV821', tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
  ];

  const result = buildBerangkatGroups(items);

  assert.equal(result.length, 2);
});

test('buildBerangkatGroups mengurutkan hasil berdasarkan tgl_berangkat menaik', () => {
  const items = [
    { nama: 'A', paket: 'PAKET LATE', jadwal_id: 'J-LATE', tgl_berangkat: '2026-09-01', jk: 'L', hari_lagi: 30, lunas: true, sisa: 0, wa: null },
    { nama: 'B', paket: 'PAKET EARLY', jadwal_id: 'J-EARLY', tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
  ];

  const result = buildBerangkatGroups(items);

  assert.equal(result[0].tgl_berangkat, '2026-08-05');
});

test('getDestinationFlags jatuh ke Arab Saudi saat tidak ada kecocokan', () => {
  const flags = getDestinationFlags('UMROH REGULER 9HR');

  assert.deepEqual(flags, [{ code: 'sa', label: 'Arab Saudi', src: '/flags/saudi.png', fallback: 'SA' }]);
});

test('getDestinationFlags mengenali satu negara tambahan', () => {
  const flags = getDestinationFlags('PROMO PLUS DUBAI 11HR');

  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'ae');
});

test('getDestinationFlags mengenali banyak negara, urut sesuai EXTRA_DESTINATION_FLAGS', () => {
  const flags = getDestinationFlags('PLUS DUBAI DAN TURKI');

  assert.deepEqual(flags.map(flag => flag.code), ['ae', 'tr']);
});

test('cleanTourLeader membuang bullet dan merapatkan spasi, string kosong jadi null', () => {
  assert.equal(cleanTourLeader('•  H. Ahmad'), 'H. Ahmad');
  assert.equal(cleanTourLeader(''), null);
});

test('realDateKey menolak sentinel 0000-00-00 dan tanggal yang tak ada di kalender', () => {
  // umroh_schedules memakai '0000-00-00' sebagai "tidak ada tanggal" (JBU0679,
  // JBU1577). Regex saja meloloskannya, dan Date.parse('2026-02-31') justru
  // VALID (bergeser jadi 3 Maret) — dua-duanya harus ditolak.
  assert.equal(realDateKey('0000-00-00'), null);
  assert.equal(realDateKey('2026-02-31'), null);
  assert.equal(realDateKey('2026-13-01'), null);
  assert.equal(realDateKey(''), null);
  assert.equal(realDateKey(null), null);
  assert.equal(realDateKey(undefined), null);
  assert.equal(realDateKey('bukan tanggal'), null);
});

test('realDateKey meloloskan tanggal nyata dan memotong bagian waktu', () => {
  assert.equal(realDateKey('2026-08-14'), '2026-08-14');
  assert.equal(realDateKey('2026-02-28'), '2026-02-28');
  assert.equal(realDateKey('2024-02-29'), '2024-02-29'); // kabisat
  assert.equal(realDateKey('2026-08-14T00:00:00.000Z'), '2026-08-14');
});

test('cleanTourLeader menganggap placeholder strip sebagai belum ditentukan', () => {
  // calendar_events menyimpan "-" (dan "•  -") untuk TL yang belum ditunjuk —
  // 5 dari 11 sesi manasik dalam jendela 2026-08-14 begitu. Diloloskan apa
  // adanya, baris ringkas manasik berbunyi "18 Jamaah · -".
  assert.equal(cleanTourLeader('-'), null);
  assert.equal(cleanTourLeader('•  -'), null);
  assert.equal(cleanTourLeader('--'), null);
  assert.equal(cleanTourLeader(' – '), null);
  // Nama yang memuat strip TETAP nama
  assert.equal(cleanTourLeader('H. AHMAD AL-FARISI'), 'H. AHMAD AL-FARISI');
});

test('fmtTglHari menyertakan nama hari dan tak bergeser oleh zona waktu pembaca', () => {
  // Dibaca sebagai UTC, sama seperti ManasikDateChip: kunci tanggalnya polos
  // 'YYYY-MM-DD', jadi nama harinya harus persis milik tanggal itu di mana pun
  // pembacanya berada — hari yang meleset jauh lebih kentara daripada tanggal.
  assert.equal(fmtTglHari('2026-08-15'), 'Sabtu, 15 Agustus 2026');
  assert.equal(fmtTglHari('2026-09-19'), 'Sabtu, 19 September 2026');
  assert.equal(fmtTglHari(null), '-');
  assert.equal(fmtTglHari('0000-00-00'), '-');
});
