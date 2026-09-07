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
const { daysFromResponse } = await loadTs('src/lib/itineraryRail.ts');

/** Bentuk hari apa adanya dari parser PDF. */
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
