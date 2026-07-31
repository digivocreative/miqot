import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildItineraryShareMeta,
  formatIdDate,
  formatPackageTitle,
  ogSegments,
  segmentsSentence,
} from '../lib/itinerary-share-meta.js';

test('formatPackageTitle: huruf besar semua jadi title case', () => {
  assert.equal(formatPackageTitle('UMROH AKHIR RAMADHAN 1447'), 'Umroh Akhir Ramadhan 1447');
});

test('formatPackageTitle: kode maskapai dan token berangka dibiarkan', () => {
  assert.equal(formatPackageTitle('UMROH PLUS TURKI 12 HARI BY SV'), 'Umroh Plus Turki 12 Hari by SV');
  assert.equal(formatPackageTitle('PAKET A'), 'Paket A');
});

test('formatPackageTitle: token pertama tak pernah dikecilkan', () => {
  assert.equal(formatPackageTitle('BY SAUDIA'), 'By Saudia');
});

test('formatPackageTitle: nama campuran dibiarkan apa adanya', () => {
  assert.equal(formatPackageTitle('Umroh Ramadhan Reguler'), 'Umroh Ramadhan Reguler');
});

test('formatPackageTitle: kosong', () => {
  assert.equal(formatPackageTitle(null), '');
});

test('formatIdDate: ISO jadi tanggal Indonesia', () => {
  assert.equal(formatIdDate('2027-03-12'), '12 Maret 2027');
  assert.equal(formatIdDate(''), '');
  assert.equal(formatIdDate('bukan-tanggal'), '');
});

test('ogSegments: malam per kota, segmen Indonesia dibuang', () => {
  const days = [
    { location: 'Jakarta' },
    { location: 'Madinah' },
    { location: 'Madinah' },
    { location: 'Madinah' },
    { location: 'Mekkah' },
    { location: 'Mekkah' },
    { location: 'Jakarta' },
  ];
  assert.deepEqual(ogSegments(days), [
    { key: 'madinah', nights: 3 },
    { key: 'mekkah', nights: 2 },
  ]);
});

test('ogSegments: null kalau lokasi tak terbaca', () => {
  assert.equal(ogSegments([{ location: '' }, { location: '' }, { location: '' }]), null);
  assert.equal(ogSegments([]), null);
});

test('segmentsSentence', () => {
  assert.equal(
    segmentsSentence([{ key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }]),
    'Madinah 3, Mekkah 4 malam'
  );
  assert.equal(segmentsSentence(null), '');
});

test('buildItineraryShareMeta: kasus lengkap', () => {
  const meta = buildItineraryShareMeta({
    paketName: 'UMROH AKHIR RAMADHAN 1447',
    packageId: 'UAR1447',
    segments: [{ key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }, { key: 'dubai', nights: 2 }],
    dayCount: 9,
    departDate: '2027-03-12',
    airline: 'SAUDIA',
    agentName: 'Bagas Pramudita',
  });
  assert.equal(meta.title, 'Itinerary Umroh Akhir Ramadhan 1447 — Alhijaz Indowisata');
  assert.equal(
    meta.description,
    'Rencana perjalanan hari per hari: Madinah 3, Mekkah 4, Dubai 2 malam. '
    + 'Berangkat 12 Maret 2027 dengan Saudia. Bersama Bagas Pramudita — Alhijaz Indowisata.'
  );
  assert.ok(meta.description.length <= 160);
});

test('buildItineraryShareMeta: tanpa segmen jatuh ke jumlah hari', () => {
  const meta = buildItineraryShareMeta({
    paketName: 'UMROH HEMAT',
    packageId: 'UH1',
    segments: null,
    dayCount: 9,
    departDate: '2027-03-12',
    airline: 'SAUDIA',
    agentName: 'Bagas Pramudita',
  });
  assert.ok(meta.description.startsWith('Rencana perjalanan 9 hari.'));
});

test('buildItineraryShareMeta: klausa maskapai dibuang lebih dulu saat kepanjangan', () => {
  const meta = buildItineraryShareMeta({
    paketName: 'UMROH PLUS TURKI MESIR',
    packageId: 'UPTM',
    segments: [
      { key: 'madinah', nights: 3 }, { key: 'mekkah', nights: 4 }, { key: 'dubai', nights: 2 },
      { key: 'turki', nights: 3 }, { key: 'mesir', nights: 2 },
    ],
    dayCount: 16,
    departDate: '2027-09-12',
    airline: 'TURKISH AIRLINES',
    agentName: 'Muhammad Abdurrahman Alhabsyi',
  });
  assert.ok(meta.description.length <= 160, meta.description);
  assert.ok(!meta.description.includes('dengan'), meta.description);
  assert.ok(meta.description.includes('Muhammad Abdurrahman Alhabsyi'));
});

test('buildItineraryShareMeta: nama paket kosong jatuh ke packageId', () => {
  const meta = buildItineraryShareMeta({ paketName: '', packageId: 'uar1447', agentName: 'Bagas' });
  assert.equal(meta.title, 'Itinerary UAR1447 — Alhijaz Indowisata');
});
