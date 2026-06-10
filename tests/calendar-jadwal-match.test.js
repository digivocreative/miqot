import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeName,
  overlapScore,
  parseManasikPaket,
  matchEventToSchedule,
  findSiblingKeberangkatan,
} from '../lib/calendar-jadwal-match.js';

const SCHEDULES = [
  {
    jadwal_id: 'JBU1517',
    jadwal_nama: 'REGULER MIX PAKET RAHMAH & UHUD 9HR (KERETA CEPAT)',
    berangkat_tgl: '2026-06-13',
    pulang_tgl: '2026-06-21',
    manasik_tgl: '2026-05-30',
    seat_total: '47',
  },
  {
    jadwal_id: 'JBU1520',
    jadwal_nama: 'REGULER 9HR (KERETA CEPAT)',
    berangkat_tgl: '2026-06-13',
    pulang_tgl: '2026-06-21',
    manasik_tgl: '2026-05-30',
    seat_total: '46',
  },
  {
    jadwal_id: 'JBU1503',
    jadwal_nama: "JUM'ATAIN PLUS TAIF + BADAR MIX PAKET UHUD & RAHMAH 12HR (KERETA CEPAT)",
    berangkat_tgl: '2026-06-17',
    pulang_tgl: '2026-06-28',
    manasik_tgl: '2026-06-07',
    seat_total: '41',
  },
];

test('parseManasikPaket memisahkan prefix tanggal berangkat DD/MM/YYYY', () => {
  const r = parseManasikPaket('13/06/2026REGULER 9HR (KERETA CEPAT)');
  assert.equal(r.departureDate, '2026-06-13');
  assert.equal(r.name, 'REGULER 9HR (KERETA CEPAT)');
});

test('parseManasikPaket tanpa prefix mengembalikan nama apa adanya', () => {
  const r = parseManasikPaket('WAITINGLIST');
  assert.equal(r.departureDate, null);
  assert.equal(r.name, 'WAITINGLIST');
});

test('keberangkatan match via berangkat_tgl + nama', () => {
  const ev = {
    event_type: 'keberangkatan',
    event_date: '2026-06-17',
    paket: "JUM'ATAIN PLUS TAIF + BADAR MIX PAKET UHUD & RAHMAH 12HR (KERETA CEPAT)",
    pax: 41,
  };
  assert.equal(matchEventToSchedule(ev, SCHEDULES)?.jadwal_id, 'JBU1503');
});

test('kepulangan match via pulang_tgl', () => {
  const ev = {
    event_type: 'kepulangan',
    event_date: '2026-06-21',
    paket: 'REGULER MIX PAKET RAHMAH & UHUD 9HR (KERETA CEPAT)',
    pax: 47,
  };
  assert.equal(matchEventToSchedule(ev, SCHEDULES)?.jadwal_id, 'JBU1517');
});

test('manasik match via prefix tanggal berangkat, bukan event_date', () => {
  const ev = {
    event_type: 'manasik',
    event_date: '2026-05-30',
    paket: '13/06/2026REGULER 9HR (KERETA CEPAT)',
    pax: 46,
  };
  assert.equal(matchEventToSchedule(ev, SCHEDULES)?.jadwal_id, 'JBU1520');
});

test('dua jadwal setanggal bernama mirip: nama lebih spesifik menang', () => {
  // "REGULER MIX PAKET RAHMAH & UHUD 9HR" vs "REGULER 9HR" sama-sama 13 Jun:
  // semua token milik baris kalender harus tertutup penuh oleh nama jadwal.
  const ev = {
    event_type: 'keberangkatan',
    event_date: '2026-06-13',
    paket: 'REGULER MIX PAKET RAHMAH & UHUD 9HR (KERETA CEPAT)',
    pax: 47,
  };
  assert.equal(matchEventToSchedule(ev, SCHEDULES)?.jadwal_id, 'JBU1517');
});

test('skor seri dipecah dengan seat_total terdekat ke pax legacy', () => {
  const twins = [
    { jadwal_id: 'A', jadwal_nama: 'REGULER 9HR', berangkat_tgl: '2026-12-22', pulang_tgl: null, manasik_tgl: null, seat_total: '40' },
    { jadwal_id: 'B', jadwal_nama: 'REGULER 9HR', berangkat_tgl: '2026-12-22', pulang_tgl: null, manasik_tgl: null, seat_total: '45' },
  ];
  const ev = { event_type: 'keberangkatan', event_date: '2026-12-22', paket: 'REGULER 9HR', pax: 45 };
  assert.equal(matchEventToSchedule(ev, twins)?.jadwal_id, 'B');
});

test('tidak ada kandidat setanggal → null (jangan salah kloter)', () => {
  const ev = { event_type: 'keberangkatan', event_date: '2027-08-01', paket: 'WAITINGLIST', pax: 162 };
  assert.equal(matchEventToSchedule(ev, SCHEDULES), null);
});

test('overlap di bawah ambang 50% → null', () => {
  const ev = {
    event_type: 'keberangkatan',
    event_date: '2026-06-13',
    paket: 'PROMO HEMAT BANDUNG SURABAYA TURKI',
    pax: 45,
  };
  assert.equal(matchEventToSchedule(ev, SCHEDULES), null);
});

test('kepulangan gagal match tanggal → warisi keberangkatan se-kloter terdekat', () => {
  // pulang_tgl API paket plus-negara bisa beda dari tanggal pulang riil
  const mapped = [
    { jadwal_id: 'JBU1400', event_date: '2026-05-20', event_type: 'keberangkatan', group_number: '7', paket: 'PLUS TURKEY 15HR (KERETA CEPAT)' },
    { jadwal_id: 'JBU1496', event_date: '2026-07-04', event_type: 'keberangkatan', group_number: '7', paket: 'PLUS TURKEY 15HR (KERETA CEPAT)' },
  ];
  const ev = { event_type: 'kepulangan', event_date: '2026-07-18', group_number: '7', paket: 'PLUS TURKEY 15HR (KERETA CEPAT)' };
  assert.equal(findSiblingKeberangkatan(ev, mapped)?.jadwal_id, 'JBU1496');
});

test('sibling fallback menolak group sama tapi paket beda (group_number dipakai ulang)', () => {
  const mapped = [
    { jadwal_id: 'JBU1531', event_date: '2026-06-17', event_type: 'keberangkatan', group_number: '1', paket: "JUM'ATAIN PLUS TAIF 12HR" },
  ];
  const ev = { event_type: 'kepulangan', event_date: '2026-06-28', group_number: '1', paket: 'WAITINGLIST' };
  assert.equal(findSiblingKeberangkatan(ev, mapped), null);
});

test('sibling fallback menolak keberangkatan setelah tanggal pulang atau terlalu jauh', () => {
  const mapped = [
    { jadwal_id: 'A', event_date: '2026-07-20', event_type: 'keberangkatan', group_number: '7', paket: 'PLUS TURKEY 15HR' },
    { jadwal_id: 'B', event_date: '2026-05-01', event_type: 'keberangkatan', group_number: '7', paket: 'PLUS TURKEY 15HR' },
  ];
  // A berangkat SETELAH pulang 18 Jul; B lebih dari 45 hari sebelumnya
  const ev = { event_type: 'kepulangan', event_date: '2026-07-18', group_number: '7', paket: 'PLUS TURKEY 15HR' };
  assert.equal(findSiblingKeberangkatan(ev, mapped), null);
});

test('manasik tanpa prefix → warisi keberangkatan se-kloter SETELAH tanggal manasik', () => {
  const mapped = [
    { jadwal_id: 'JBU1520', event_date: '2026-07-01', event_type: 'keberangkatan', group_number: '6', paket: 'REGULER PAKET RAHMAH 9HR' },
  ];
  const ev = { event_type: 'manasik', event_date: '2026-06-20', group_number: '6', paket: 'REGULER PAKET RAHMAH 9HR' };
  assert.equal(findSiblingKeberangkatan(ev, mapped)?.jadwal_id, 'JBU1520');
});

test('tokenizeName & overlapScore: tanda baca diabaikan, token <3 huruf dibuang', () => {
  const words = tokenizeName("JUM'ATAIN + TAIF 9HR");
  assert.deepEqual(words, ['JUM', 'ATAIN', 'TAIF', '9HR']);
  assert.equal(overlapScore(words, "JUM'ATAIN + TAIF 9HR"), 1);
  // Jaccard: token ekstra di sisi API ikut dipenalti (4 irisan / 5 union)
  assert.equal(overlapScore(words, "jum'atain plus taif 9hr"), 0.8);
});

test('nama persis menang atas varian superset (kasus grp25 22 Agt)', () => {
  const aug22 = [
    { jadwal_id: 'JBU1525', jadwal_nama: 'UMRAH REGULER PLUS REDSEA PAKET RAHMAH 9HR ( KERETA CEPAT)', berangkat_tgl: '2026-08-22', pulang_tgl: '2026-08-30', manasik_tgl: null, seat_total: '45' },
    { jadwal_id: 'JBU1529', jadwal_nama: 'UMRAH REGULER PLUS REDSEA 9HR ( KERETA CEPAT)', berangkat_tgl: '2026-08-22', pulang_tgl: '2026-08-30', manasik_tgl: null, seat_total: '45' },
  ];
  const grp25 = { event_type: 'keberangkatan', event_date: '2026-08-22', paket: 'UMRAH REGULER PLUS REDSEA 9HR ( KERETA CEPAT)', pax: 45 };
  assert.equal(matchEventToSchedule(grp25, aug22)?.jadwal_id, 'JBU1529');
  const grp24 = { event_type: 'keberangkatan', event_date: '2026-08-22', paket: 'UMRAH REGULER PLUS REDSEA PAKET RAHMAH 9HR ( KERETA CEPAT)', pax: 45 };
  assert.equal(matchEventToSchedule(grp24, aug22)?.jadwal_id, 'JBU1525');
});

test('token generik/containment tidak menembus ambang (kasus 15 Agt → JBU1524)', () => {
  const aug15 = [
    { jadwal_id: 'JBU1524', jadwal_nama: 'UMRAH REGULER PLUS REDSEA 9HR', berangkat_tgl: '2026-08-15', pulang_tgl: '2026-08-23', manasik_tgl: null, seat_total: '45' },
  ];
  // grp19/grp20 jadwalnya memang tidak ada di API — harus null (fallback kuota),
  // bukan mencuri angka jamaah kloter REDSEA
  const grp19 = { event_type: 'keberangkatan', event_date: '2026-08-15', paket: 'PROMO UMRAH HEMAT 9HR', pax: 140 };
  const grp20 = { event_type: 'keberangkatan', event_date: '2026-08-15', paket: 'REGULER 9HR (KERETA CEPAT)', pax: 45 };
  assert.equal(matchEventToSchedule(grp19, aug15), null);
  assert.equal(matchEventToSchedule(grp20, aug15), null);
});

test('kepulangan beda paket tidak dibajak token generik (grp22 PLUS TURKEY)', () => {
  const candidates = [
    { jadwal_id: 'JBU1525', jadwal_nama: 'UMRAH REGULER PLUS REDSEA PAKET RAHMAH 9HR ( KERETA CEPAT)', berangkat_tgl: '2026-08-22', pulang_tgl: '2026-08-30', manasik_tgl: null, seat_total: '45' },
  ];
  const ev = { event_type: 'kepulangan', event_date: '2026-08-30', paket: 'PLUS TURKEY 15HR (KERETA CEPAT)', pax: 45 };
  // null → fallback sibling keberangkatan (pass 2) yang akan mewarisi jadwal benar
  assert.equal(matchEventToSchedule(ev, candidates), null);
});

test('seri skor + seri seat_total → jadwal_id terkecil (deterministik)', () => {
  const twins = [
    { jadwal_id: 'JBU1554', jadwal_nama: 'REGULER 9HR (KERETA CEPAT)', berangkat_tgl: '2026-12-21', pulang_tgl: null, manasik_tgl: null, seat_total: '45' },
    { jadwal_id: 'JBU1542', jadwal_nama: 'REGULER 9HR ( KERETA  CEPAT)', berangkat_tgl: '2026-12-21', pulang_tgl: null, manasik_tgl: null, seat_total: '45' },
  ];
  const ev = { event_type: 'keberangkatan', event_date: '2026-12-21', paket: 'REGULER 9HR (KERETA CEPAT)', pax: 45 };
  assert.equal(matchEventToSchedule(ev, twins)?.jadwal_id, 'JBU1542');
  assert.equal(matchEventToSchedule(ev, [...twins].reverse())?.jadwal_id, 'JBU1542');
});
