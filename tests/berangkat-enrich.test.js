import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichBerangkatRows } from '../lib/berangkat-enrich.js';

const rows = [
  { nama: 'A', id_jadwal: 'J1', tgl_berangkat: '2026-08-10' },
  { nama: 'B', id_jadwal: 'J2', tgl_berangkat: '2026-08-12' },
  { nama: 'C', id_jadwal: null, tgl_berangkat: '2026-08-14' },
];

test('enrichBerangkatRows menandai itinerary_ready hanya untuk jadwal yang ada di tabel itineraries', () => {
  const result = enrichBerangkatRows(rows, { itineraryJadwalIds: ['J1'] });

  assert.equal(result[0].itinerary_ready, true);
  assert.equal(result[1].itinerary_ready, false);
});

test('enrichBerangkatRows menyetel itinerary_ready false untuk baris tanpa id_jadwal', () => {
  // Tanpa jadwal_id tak ada URL share yang bisa disusun, apa pun isi daftarnya.
  const result = enrichBerangkatRows(rows, { itineraryJadwalIds: ['J1', 'J2', null] });

  assert.equal(result[2].jadwal_id, null);
  assert.equal(result[2].itinerary_ready, false);
});

test('enrichBerangkatRows fail-soft: daftar itinerary kosong tidak menghilangkan baris', () => {
  // Jalur query gagal di loadEnrichedBerangkatRows — daftar keberangkatan tetap
  // utuh, hanya tombol salinnya yang tak muncul.
  const result = enrichBerangkatRows(rows);

  assert.equal(result.length, 3);
  assert.equal(result.every(row => row.itinerary_ready === false), true);
});

test('enrichBerangkatRows menerima Set maupun array untuk itineraryJadwalIds', () => {
  const result = enrichBerangkatRows(rows, { itineraryJadwalIds: new Set(['J2']) });

  assert.equal(result[0].itinerary_ready, false);
  assert.equal(result[1].itinerary_ready, true);
});

test('enrichBerangkatRows tetap memetakan metadata jadwal dan tour leader', () => {
  const scheduleDetailMap = new Map([
    ['J1', { jadwal_nama: 'UMROH REGULER 9HR', manasik_tgl: '2026-08-01', manasik_jam: '09:00', berangkat_kode_penerbangan: 'SV821' }],
  ]);
  const calendarRows = [
    { jadwal_id: 'J1', event_date: '2026-08-10', tour_leader: 'H. Ahmad' },
    { jadwal_id: 'J1', event_date: '2026-08-11', tour_leader: 'H. Budi' },
  ];

  const result = enrichBerangkatRows(rows, { scheduleDetailMap, calendarRows, itineraryJadwalIds: ['J1'] });

  assert.equal(result[0].jadwal_nama, 'UMROH REGULER 9HR');
  assert.equal(result[0].berangkat_kode_penerbangan, 'SV821');
  // event_date paling awal yang menang (pickEarliestByJadwal)
  assert.equal(result[0].tour_leader, 'H. Ahmad');
  assert.equal(result[0].itinerary_ready, true);
});
