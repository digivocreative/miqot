import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inferJourneyOrderFromItinerary,
  inferSaudiJourneyOrderFromItinerary,
  saudiOrderContradictsRoute,
} from '../lib/journey-order.js';

test('inferSaudiJourneyOrderFromItinerary: Jeddah landing can still mean Madinah first', () => {
  const content = {
    days: [
      { dayNumber: 'Hari 1', title: 'Jakarta - Jeddah - Madinah', location: 'Jakarta - Jeddah - Madinah' },
      { dayNumber: 'Hari 2', title: 'Madinah', location: 'Madinah' },
      { dayNumber: 'Hari 4', title: 'Medinah - Mekah', location: 'Medinah - Mekah' },
      { dayNumber: 'Hari 5', title: 'Mekkah', location: 'Mekkah' },
    ],
  };

  assert.deepEqual(inferSaudiJourneyOrderFromItinerary(content), ['Madinah', 'Umroh']);
});

test('inferSaudiJourneyOrderFromItinerary: detects Umroh first when Mekkah appears before Madinah', () => {
  const content = {
    days: [
      { dayNumber: 'Hari 1', title: 'Jakarta - Jeddah - Mekkah', location: 'Jakarta - Jeddah - Mekkah' },
      { dayNumber: 'Hari 2', title: 'Mekkah', location: 'Mekkah' },
      { dayNumber: 'Hari 6', title: 'Mekkah - Madinah', location: 'Mekkah - Madinah' },
      { dayNumber: 'Hari 7', title: 'Madinah', location: 'Madinah' },
    ],
  };

  assert.deepEqual(inferSaudiJourneyOrderFromItinerary(content), ['Umroh', 'Madinah']);
});

test('inferSaudiJourneyOrderFromItinerary: ignores generic manasik umroh before Mekkah phase', () => {
  const content = {
    days: [
      {
        dayNumber: 'Hari 1',
        title: 'Jakarta - Jeddah - Madinah',
        location: 'Jakarta - Jeddah - Madinah',
        activities: [{ text: 'Manasik dan pembekalan umroh di Madinah' }],
      },
      { dayNumber: 'Hari 4', title: 'Medinah - Mekah', location: 'Medinah - Mekah' },
    ],
  };

  assert.deepEqual(inferSaudiJourneyOrderFromItinerary(content), ['Madinah', 'Umroh']);
});

test('inferJourneyOrderFromItinerary: JBU1582 keeps Dubai as transit and includes its actual Taif tour', () => {
  const content = {
    days: [
      {
        title: 'ITINERARY UMRAH JUM’ATAIN PLUS TAIF',
        location: 'Jakarta – Dubai',
        activities: [
          { text: 'Berangkat menuju Dubai dengan pesawat Emirates EK 357' },
          { text: 'Tiba di bandara Dubai (transit)' },
        ],
      },
      {
        title: 'Dubai - Madinah',
        location: 'Dubai - Madinah',
        activities: [{ text: 'Melanjutkan perjalanan menuju Medinah' }],
      },
      { title: 'Ziarah Madinah', location: 'Madinah' },
      { title: 'Medinah - Mekah', location: 'Medinah - Mekah' },
      {
        title: 'Mekkah – Taif – Mekkah',
        location: 'Mekkah – Taif – Mekkah',
        activities: [{ text: 'Citytour ke Kota Thaif' }],
      },
      {
        title: 'Jeddah – Dubai - Jakarta',
        location: 'Jeddah – Dubai - Jakarta',
        activities: [{ text: 'Tiba di bandara Dubai (transit)' }],
      },
    ],
  };

  assert.deepEqual(
    inferJourneyOrderFromItinerary(content),
    ['Madinah', 'Umroh', 'Tur Taif']
  );
});

test('inferJourneyOrderFromItinerary: places a real Dubai tour before the Saudi journey', () => {
  const content = {
    days: [
      {
        title: 'Promo Umrah Plus Dubai',
        location: 'Jakarta - Dubai',
        activities: [{ text: 'Tiba di Dubai, cek in hotel dan istirahat' }],
      },
      {
        title: 'City Tour Dubai',
        location: 'Dubai - Medinah',
        activities: [{ text: 'City tour Dubai, photostop di Burj Khalifah' }],
      },
      { title: 'Ziarah Madinah', location: 'Medinah' },
      { title: 'Menuju Mekkah', location: 'Medinah - Mekkah' },
    ],
  };

  assert.deepEqual(
    inferJourneyOrderFromItinerary(content),
    ['Tur Dubai', 'Madinah', 'Umroh']
  );
});

test('inferJourneyOrderFromItinerary: places a real Dubai tour after Umroh when itinerary does', () => {
  const content = {
    days: [
      { title: 'Ziarah Madinah', location: 'Medinah' },
      { title: 'Menuju Mekkah', location: 'Medinah - Mekkah' },
      { title: 'Ibadah di Mekkah', location: 'Mekkah' },
      {
        title: 'City Tour Dubai',
        location: 'Dubai',
        activities: [{ text: 'Citytour ke Burj Khalifah dan desert safari' }],
      },
    ],
  };

  assert.deepEqual(
    inferJourneyOrderFromItinerary(content),
    ['Madinah', 'Umroh', 'Tur Dubai']
  );
});

test('inferJourneyOrderFromItinerary: preserves Taif and Badar positions inside the Saudi journey', () => {
  const content = {
    days: [
      { title: 'Umrah di Mekkah', location: 'Jakarta - Jeddah - Mekkah' },
      {
        title: 'Citytour Taif',
        location: 'Mekkah - Taif - Mekkah',
        activities: [{ text: 'Citytour ke Kota Taif' }],
      },
      { title: 'Menuju Medinah', location: 'Mekkah - Medinah' },
      {
        title: 'Ziarah Badar',
        location: 'Medinah',
        activities: [{ text: 'Ziarah kota Badar dan makam syuhada' }],
      },
    ],
  };

  assert.deepEqual(
    inferJourneyOrderFromItinerary(content),
    ['Umroh', 'Tur Taif', 'Madinah', 'Ziarah Badar']
  );
});

test('inferJourneyOrderFromItinerary: attributes a generic city tour to Haikou from the day location', () => {
  const content = {
    days: [
      { title: 'Ziarah Madinah', location: 'Madinah' },
      { title: 'Menuju Mekkah', location: 'Madinah - Mekkah' },
      {
        title: 'Kembali ke Jakarta',
        location: 'Haikou - Jakarta',
        activities: [{ text: 'Jamaah berkumpul untuk City Tour' }],
      },
    ],
  };

  assert.deepEqual(
    inferJourneyOrderFromItinerary(content),
    ['Madinah', 'Umroh', 'Tur China']
  );
});

test('inferJourneyOrderFromItinerary: package-style titles alone do not invent a Red Sea tour', () => {
  const content = {
    days: [
      { title: 'ITINERARY UMRAH PLUS REDSEA', location: 'Jakarta - Madinah' },
      { title: 'ITINERARY UMRAH PLUS REDSEA', location: 'Madinah' },
      { title: 'ITINERARY UMRAH PLUS REDSEA', location: 'Madinah - Mekkah' },
      { title: 'ITINERARY UMRAH PLUS REDSEA', location: 'Mekkah' },
    ],
  };

  assert.deepEqual(
    inferJourneyOrderFromItinerary(content),
    ['Madinah', 'Umroh']
  );
});

test('saudiOrderContradictsRoute: landing MED vs itinerary Umroh-dulu = kontradiksi (kasus JBU1513)', () => {
  assert.equal(
    saudiOrderContradictsRoute(['Umroh', 'Tur Taif', 'Madinah', 'Ziarah Badar'], 'CGK - MED'),
    true
  );
});

test('saudiOrderContradictsRoute: landing MED via transit tetap kontradiksi', () => {
  assert.equal(
    saudiOrderContradictsRoute(['Umroh', 'Madinah'], 'CGK-DXB / DXB-MED'),
    true
  );
});

test('saudiOrderContradictsRoute: landing MED dengan Madinah dulu = konsisten', () => {
  assert.equal(
    saudiOrderContradictsRoute(['Madinah', 'Umroh', 'Tur Red Sea'], 'CGK - MED'),
    false
  );
});

test('saudiOrderContradictsRoute: landing JED sengaja tidak dianggap kontradiksi (pola Jum\'atain ambigu)', () => {
  assert.equal(
    saudiOrderContradictsRoute(['Madinah', 'Umroh'], 'CGK - JED'),
    false
  );
  assert.equal(
    saudiOrderContradictsRoute(['Umroh', 'Madinah'], 'CGK - JED'),
    false
  );
});

test('saudiOrderContradictsRoute: rute Turki-dulu (IST sebelum MED) tidak memicu guard (kasus JBU1565)', () => {
  assert.equal(
    saudiOrderContradictsRoute(['Tur Turki', 'Madinah', 'Umroh'], 'CGK-JED/JED-IST/IST-MED'),
    false
  );
});

test('saudiOrderContradictsRoute: rute kosong / order tanpa pasangan Saudi = tidak pernah kontradiksi', () => {
  assert.equal(saudiOrderContradictsRoute(['Umroh', 'Madinah'], ''), false);
  assert.equal(saudiOrderContradictsRoute(['Umroh', 'Madinah'], undefined), false);
  assert.equal(saudiOrderContradictsRoute(['Umroh'], 'CGK - MED'), false);
  assert.equal(saudiOrderContradictsRoute(null, 'CGK - MED'), false);
});
