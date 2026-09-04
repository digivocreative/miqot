import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_ID_RE,
  buildPackageShareMeta,
  formatHotelName,
  formatPriceShort,
  roomLabelId,
  seatNoteId,
} from '../lib/package-share-meta.js';

test('PACKAGE_ID_RE: kode jadwal lolos, path SPA lain tidak', () => {
  assert.ok(PACKAGE_ID_RE.test('JBU1509'));
  assert.ok(PACKAGE_ID_RE.test('JHU0212'));
  assert.ok(!PACKAGE_ID_RE.test('KALKULASI'));
  assert.ok(!PACKAGE_ID_RE.test('INDEX-C8XK3.JS'));
  assert.ok(!PACKAGE_ID_RE.test('NOVEMBER'));
  assert.ok(!PACKAGE_ID_RE.test('1448'));
});

test('formatPriceShort: bentuknya sama dengan harga header kartu paket', () => {
  assert.equal(formatPriceShort(39900000), 'Rp 39.9 Jt');
  assert.equal(formatPriceShort(28000000), 'Rp 28 Jt');
  assert.equal(formatPriceShort(0), '');
  assert.equal(formatPriceShort(null), '');
});

test('roomLabelId: Quard ditulis Quad seperti di kartu', () => {
  assert.equal(roomLabelId('Quard'), 'Quad');
  assert.equal(roomLabelId('Triple'), 'Triple');
  assert.equal(roomLabelId(null), '');
});

test('seatNoteId: hanya saat kursi tinggal sedikit', () => {
  assert.equal(seatNoteId(2), 'sisa 2 kursi');
  assert.equal(seatNoteId(10), 'sisa 10 kursi');
  assert.equal(seatNoteId(24), '');
});

test('seatNoteId: sisa 0 TIDAK diklaim habis (paket berangkat pun dinolkan)', () => {
  assert.equal(seatNoteId(0), '');
  assert.equal(seatNoteId(-3), '');
  assert.equal(seatNoteId(null), '');
});

test('formatHotelName: kapital sumber diturunkan, "AL" jadi kata sandang', () => {
  assert.equal(formatHotelName('ANWAR ALMADINAH MOVENPICK'), 'Anwar Almadinah Movenpick');
  assert.equal(formatHotelName('AL HARAM'), 'Al Haram');
});

test('buildPackageShareMeta: judul memakai nama paket, bukan judul generik agent', () => {
  const { title } = buildPackageShareMeta({
    paketName: 'PLUS REDSEA PAKET RAHMAH 9HR (KERETA CEPAT)',
    packageId: 'JBU1509',
    agentName: 'Nikita Sari',
  });
  assert.equal(title, 'Plus Redsea Paket Rahmah 9HR (Kereta Cepat) — Alhijaz Indowisata');
});

test('buildPackageShareMeta: deskripsi membawa tanggal, harga, kursi, dan agent', () => {
  const { description } = buildPackageShareMeta({
    paketName: 'PLUS REDSEA PAKET RAHMAH 9HR (KERETA CEPAT)',
    packageId: 'JBU1509',
    departDate: '2026-10-03',
    durationDays: 9,
    airline: 'SAUDIA',
    priceFrom: 39900000,
    priceRoom: 'Quard',
    seatSisa: 2,
    agentName: 'Nikita Sari',
  });
  assert.ok(description.includes('Umroh 9 hari'));
  assert.ok(description.includes('3 Oktober 2026'));
  assert.ok(description.includes('Rp 39.9 Jt/pax'));
  assert.ok(description.includes('sisa 2 kursi'));
  assert.ok(description.includes('Nikita Sari'));
  assert.ok(description.length <= 160);
});

test('buildPackageShareMeta: klausa dibuang bertahap sampai muat 160 karakter', () => {
  const { description } = buildPackageShareMeta({
    paketName: 'PLUS TURKEY ISTANBUL BURSA 15HR PAKET UHUD',
    packageId: 'JBU1530',
    departDate: '2027-01-21',
    durationDays: 15,
    airline: 'SAUDI ARABIAN AIRLINES',
    priceFrom: 52900000,
    priceRoom: 'Triple',
    seatSisa: 1,
    agentName: 'Bagas Pramudita Nugroho Wicaksono',
  });
  assert.ok(description.length <= 160, description);
  assert.ok(description.includes('Bagas Pramudita Nugroho Wicaksono'));
});

test('buildPackageShareMeta: tanpa harga tidak mengarang angka', () => {
  const { description } = buildPackageShareMeta({
    paketName: 'UMROH REGULER',
    packageId: 'JBU1500',
    departDate: '2026-11-12',
    durationDays: 9,
    seatSisa: 4,
    agentName: 'Nikita Sari',
  });
  assert.ok(!description.includes('Rp'));
  assert.ok(description.includes('Kuota sisa 4 kursi'));
});

test('buildPackageShareMeta: waiting list tidak dijual sebagai keberangkatan', () => {
  const { title, description } = buildPackageShareMeta({
    paketName: 'WAITINGLIST',
    packageId: 'JBU0679',
    departDate: '2027-08-01',
    isWaitingList: true,
    agentName: 'Nikita Sari',
  });
  assert.equal(title, 'Daftar Tunggu Umroh — Alhijaz Indowisata');
  assert.ok(description.includes('Daftar tunggu'));
  assert.ok(!description.includes('Berangkat'));
});

test('buildPackageShareMeta: tanpa agent tetap punya klausa merek', () => {
  const { description } = buildPackageShareMeta({
    paketName: 'UMROH REGULER 9HR',
    packageId: 'JBU1500',
    departDate: '2026-11-12',
    durationDays: 9,
    priceFrom: 31500000,
  });
  assert.ok(description.endsWith('Alhijaz Indowisata.'));
  assert.ok(!description.includes('Bersama'));
});
