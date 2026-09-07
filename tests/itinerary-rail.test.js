import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTs } from './fixtures/load-ts.js';

/**
 * Rail kiri menampilkan itinerary paket yang sedang dibahas. Endpoint
 * /api/itinerary/:jadwalId SAH mengembalikan 404 ("Itinerary belum tersedia")
 * dan 503 ("sedang disinkronkan") — bukan kasus langka, karena sumbernya PDF
 * yang disinkronkan berkala. Karena itu jalur degradasi diuji sekeras jalur
 * suksesnya: rail kiri tidak boleh pernah tampil kosong-melompong.
 */
const ITINERARY_RAIL = await loadTs('src/lib/itineraryRail.ts');
const { daysFromResponse, nightsByCity, activitySummary, dayCityLabel } = ITINERARY_RAIL;

const NINE_DAY = [
  { dayNumber: '1', title: 'Jakarta – Madinah', location: 'Jakarta – Madinah', activities: [] },
  { dayNumber: '2', title: 'Madinah', location: 'Madinah', activities: [] },
  { dayNumber: '3', title: 'Madinah', location: 'Madinah', activities: [] },
  { dayNumber: '4', title: 'Madinah – Makkah', location: 'Madinah – Makkah', activities: [] },
  { dayNumber: '5', title: 'Makkah', location: 'Makkah', activities: [] },
  { dayNumber: '6', title: 'Makkah', location: 'Makkah', activities: [] },
  { dayNumber: '7', title: 'Makkah', location: 'Makkah', activities: [] },
  { dayNumber: '8', title: 'Makkah – Jeddah', location: 'Makkah – Jeddah', activities: [] },
  { dayNumber: '9', title: 'Jakarta', location: 'Jakarta', activities: [] },
];

test('respons sukses memberi daftar hari', () => {
  const days = daysFromResponse(200, { success: true, data: { days: NINE_DAY } });
  assert.equal(days.length, 9);
  assert.equal(days[0].title, 'Jakarta – Madinah');
});

test('404 "belum tersedia" = null, bukan lempar galat', () => {
  assert.equal(daysFromResponse(404, { error: 'Itinerary belum tersedia' }), null);
});

test('503 "sedang disinkronkan" juga null — bukan kegagalan fatal', () => {
  assert.equal(daysFromResponse(503, { error: 'Tampilan web sedang disinkronkan.' }), null);
});

test('200 tapi badan tak berbentuk = null, bukan hari kosong yang menipu', () => {
  assert.equal(daysFromResponse(200, { success: true, data: {} }), null);
  assert.equal(daysFromResponse(200, null), null);
  assert.equal(daysFromResponse(200, { success: false }), null);
});

test('200 dengan days kosong = null — nol hari bukan itinerary', () => {
  assert.equal(daysFromResponse(200, { success: true, data: { days: [] } }), null);
});

test('kota hari diambil dari ujung rute — di situ jamaah bermalam', () => {
  assert.equal(dayCityLabel(NINE_DAY[0]), 'Madinah');
  assert.equal(dayCityLabel(NINE_DAY[3]), 'Makkah');
  assert.equal(dayCityLabel(NINE_DAY[1]), 'Madinah');
});

test('pemisah rute boleh en-dash, em-dash, atau hubung biasa', () => {
  assert.equal(dayCityLabel({ location: 'Makkah - Jeddah' }), 'Jeddah');
  assert.equal(dayCityLabel({ location: 'Makkah — Jeddah' }), 'Jeddah');
  assert.equal(dayCityLabel({ location: 'Makkah – Jeddah' }), 'Jeddah');
});

test('malam per kota: hari terakhir dan kota asal tidak dihitung', () => {
  // Hari 9 pulang ke Jakarta — bukan malam. Jakarta juga kota asal.
  assert.deepEqual(nightsByCity(NINE_DAY), [
    { city: 'Madinah', nights: 3 },
    { city: 'Makkah', nights: 4 },
    { city: 'Jeddah', nights: 1 },
  ]);
});

test('tanpa location, hari tidak mengarang kota', () => {
  assert.deepEqual(nightsByCity([{ dayNumber: '1' }, { dayNumber: '2' }]), []);
  assert.equal(dayCityLabel({ dayNumber: '1' }), null);
});

test('ringkasan aktivitas memakai aktivitas pertama, apa pun bentuknya', () => {
  assert.equal(activitySummary({ activities: ['Berkumpul di Soekarno-Hatta'] }), 'Berkumpul di Soekarno-Hatta');
  assert.equal(
    activitySummary({ activities: [{ time: '12:05', text: 'Take off GA 980' }] }),
    '12:05 · Take off GA 980',
  );
});

test('aktivitas kosong memberi string kosong, bukan "undefined"', () => {
  assert.equal(activitySummary({ activities: [] }), '');
  assert.equal(activitySummary({}), '');
});

/**
 * PDF sumber sering menulis judul hari sebagai TANGGAL dan menaruh kotanya di
 * `location`. Kalau tanggal jadi baris utama, rail terbaca seperti kalender —
 * padahal yang ditanya jamaah adalah "hari ketiga di mana?".
 */
test('judul hari berupa tanggal murni digantikan kotanya', () => {
  const { dayHeadline } = ITINERARY_RAIL;
  assert.deepEqual(
    dayHeadline({ title: 'Sabtu, 03 Oktober 2026', location: 'Jakarta – Madinah' }),
    { primary: 'Jakarta – Madinah', secondary: 'Sabtu, 03 Oktober 2026' },
  );
});

test('judul dengan rute + tanggal: rute naik, tanggal turun', () => {
  const { dayHeadline } = ITINERARY_RAIL;
  assert.deepEqual(
    dayHeadline({ title: 'Madinah – Makkah (Selasa, 06 Oktober 2026)', location: 'Madinah – Makkah' }),
    { primary: 'Madinah – Makkah', secondary: 'Selasa, 06 Oktober 2026' },
  );
});

test('judul tanpa tanggal dan lokasi berbeda: lokasi jadi baris kedua', () => {
  const { dayHeadline } = ITINERARY_RAIL;
  assert.deepEqual(
    dayHeadline({ title: 'Ziarah Kota Madinah', location: 'Madinah' }),
    { primary: 'Ziarah Kota Madinah', secondary: 'Madinah' },
  );
});

test('hari tanpa judul maupun lokasi tidak mengarang teks', () => {
  const { dayHeadline } = ITINERARY_RAIL;
  assert.deepEqual(dayHeadline({}), { primary: '', secondary: '' });
});
