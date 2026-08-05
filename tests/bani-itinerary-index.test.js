import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cityOnDate,
  isInCityOnDate,
  parseDayNumbers,
  tourLabelsFromItinerary,
} from '../lib/bani-itinerary-index.js';

test('parseDayNumbers membaca hari tunggal dan rentang semua jenis dash', () => {
  assert.deepEqual(parseDayNumbers('Hari 3-5'), [3, 4, 5]);
  assert.deepEqual(parseDayNumbers('Hari 3–5'), [3, 4, 5]);
  assert.deepEqual(parseDayNumbers('Hari 3—5'), [3, 4, 5]);
  assert.deepEqual(parseDayNumbers('Hari 4'), [4]);
  assert.deepEqual(parseDayNumbers('4'), [4]);
  assert.deepEqual(parseDayNumbers('Hari'), []);
});

test('cityOnDate memetakan tanggal lintas tahun lewat nomor hari itinerary', () => {
  const content = {
    days: [
      { dayNumber: 'Hari 1', location: 'Jakarta – Jeddah' },
      { dayNumber: 'Hari 2-5', location: 'Madinah' },
      { dayNumber: 'Hari 6', location: 'Mekkah' },
      { dayNumber: 'Hari 7-9', location: 'Mekkah – Jeddah' },
    ],
  };

  assert.equal(cityOnDate(content, '2026-12-27', '2027-01-01'), 'Mekkah');
  assert.equal(cityOnDate(content, '2026-12-27', '2026-12-30'), 'Madinah');
  assert.equal(cityOnDate(content, '2026-12-27', '2027-01-20'), null);
});

test('isInCityOnDate membedakan itinerary tak tersedia dari kota yang tidak cocok', () => {
  assert.equal(isInCityOnDate(null, '2026-12-27', '2027-01-01', 'mekkah'), null);
  const content = { days: [{ dayNumber: 'Hari 6', location: 'Medinah' }] };
  assert.equal(isInCityOnDate(content, '2026-12-27', '2027-01-01', 'madinah'), true);
  assert.equal(isInCityOnDate(content, '2026-12-27', '2027-01-01', 'mekkah'), false);
  assert.equal(
    isInCityOnDate({ days: [{ dayNumber: 'Hari 6', location: 'Mekah' }] }, '2026-12-27', '2027-01-01', 'mekkah'),
    true,
  );
});

test('tourLabelsFromItinerary mengenali Cappadocia sekali dan menjaga urutan kemunculan', () => {
  const content = {
    days: [
      { dayNumber: 'Hari 1', location: 'Cappadocia', title: 'Jelajah Cappadocia', activities: [{ text: 'Wisata Cappadocia' }] },
      { dayNumber: 'Hari 2', location: 'Istanbul', title: 'Turki', activities: [] },
      { dayNumber: 'Hari 3', location: 'Dubai', title: 'City Tour Dubai', activities: [] },
    ],
  };

  assert.deepEqual(tourLabelsFromItinerary(content), ['Tur Turki', 'Tur Dubai']);
  assert.deepEqual(tourLabelsFromItinerary(null), []);
  assert.deepEqual(tourLabelsFromItinerary('{bukan json'), []);
});
