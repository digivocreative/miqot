import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyItineraryDepartureDate,
  inferJourneyOrderFromItinerary,
  inferSaudiJourneyOrderFromItinerary,
  itineraryBelongsToOtherSchedule,
  itineraryMatchesDepartureDate,
  saudiOrderContradictsRoute,
  shouldSuppressJourneyOrder,
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

// Replika JBU1600: PDF Jeddah-dulu bertanggal persis untuk keberangkatan ini,
// sementara berangkat_rute upstream salah entri "CGK-MED / JED-IST".
const JBU1600_CONTENT = {
  days: [
    { dayNumber: '1', title: 'Ahad, 20 Desember 2026', location: 'Jakarta - Jeddah - Mekkah' },
    { dayNumber: '2', title: 'Senin, 21 Desember 2026', location: 'Mekkah' },
    { dayNumber: '5', title: 'Kamis, 24 Desember 2026', location: 'Mekkah - Madinah' },
    { dayNumber: '6', title: 'Jum\'at, 25 Desember 2026', location: 'Madinah' },
  ],
};

test('itineraryMatchesDepartureDate: judul hari-1 bertanggal == berangkat_tgl (kasus JBU1600)', () => {
  assert.equal(itineraryMatchesDepartureDate(JBU1600_CONTENT, '2026-12-20'), true);
});

test('itineraryMatchesDepartureDate: toleransi -1 hari untuk PDF hari kumpul (kasus JBU1565)', () => {
  const content = {
    days: [{ dayNumber: '1', title: 'Jakarta — Sabtu, 14 November 2026', location: 'Jakarta' }],
  };
  assert.equal(itineraryMatchesDepartureDate(content, '2026-11-15'), true);
});

test('itineraryMatchesDepartureDate: tanggal jadwal lain = tidak cocok (kelas kasus JBU1513)', () => {
  const content = {
    days: [{ dayNumber: '1', title: 'Sabtu, 04 Juli 2026', location: 'Jakarta – Madinah' }],
  };
  assert.equal(itineraryMatchesDepartureDate(content, '2026-12-20'), false);
});

test('itineraryMatchesDepartureDate: hari bertanggal pertama boleh bukan hari-1, offset indeks dihitung', () => {
  const content = {
    days: [
      { dayNumber: '1', title: 'Jakarta – Mekkah', location: 'Jakarta – Mekkah' },
      { dayNumber: '2', title: 'Mekkah', location: 'Mekkah' },
      { dayNumber: '3', title: 'Selasa, 22 Desember 2026', location: 'Mekkah' },
    ],
  };
  assert.equal(itineraryMatchesDepartureDate(content, '2026-12-20'), true);
  assert.equal(itineraryMatchesDepartureDate(content, '2026-12-01'), false);
});

test('itineraryMatchesDepartureDate: format tanggal numerik dd/mm/yyyy juga dikenali', () => {
  const content = {
    days: [{ dayNumber: '1', title: 'Hari 1 — 20/12/2026', location: 'Jakarta - Jeddah' }],
  };
  assert.equal(itineraryMatchesDepartureDate(content, '2026-12-20'), true);
});

test('itineraryMatchesDepartureDate: tanpa judul bertanggal atau tanpa berangkat_tgl = tidak terbukti', () => {
  const undated = {
    days: [
      { dayNumber: '1', title: 'Jakarta – Madinah', location: 'Jakarta – Madinah' },
      { dayNumber: '2', title: 'Madinah', location: 'Madinah' },
    ],
  };
  assert.equal(itineraryMatchesDepartureDate(undated, '2026-12-20'), false);
  assert.equal(itineraryMatchesDepartureDate(JBU1600_CONTENT, ''), false);
  assert.equal(itineraryMatchesDepartureDate(JBU1600_CONTENT, undefined), false);
  assert.equal(itineraryMatchesDepartureDate(null, '2026-12-20'), false);
});

test('shouldSuppressJourneyOrder: kontradiksi + tanggal cocok = rute yang dicurigai, urutan itinerary dipakai (JBU1600)', () => {
  assert.equal(
    shouldSuppressJourneyOrder({
      order: ['Umroh', 'Madinah', 'Tur Turki'],
      berangkatRute: 'CGK-MED / JED-IST',
      content: JBU1600_CONTENT,
      berangkatTgl: '2026-12-20',
    }),
    false
  );
});

test('shouldSuppressJourneyOrder: kontradiksi tanpa bukti tanggal = tetap ditekan (JBU1513)', () => {
  const undated = {
    days: [
      { dayNumber: '1', title: 'Jakarta - Jeddah - Mekkah', location: 'Jakarta - Jeddah - Mekkah' },
      { dayNumber: '5', title: 'Mekkah - Madinah', location: 'Mekkah - Madinah' },
    ],
  };
  assert.equal(
    shouldSuppressJourneyOrder({
      order: ['Umroh', 'Madinah'],
      berangkatRute: 'CGK - MED',
      content: undated,
      berangkatTgl: '2026-12-20',
    }),
    true
  );
});

test('shouldSuppressJourneyOrder: kontradiksi + tanggal jadwal lain = ditekan', () => {
  assert.equal(
    shouldSuppressJourneyOrder({
      order: ['Umroh', 'Madinah', 'Tur Turki'],
      berangkatRute: 'CGK-MED / JED-IST',
      content: JBU1600_CONTENT,
      berangkatTgl: '2027-01-17',
    }),
    true
  );
});

// Replika JBU1528 (13 Agt 2026): PDF keberangkatan 29 Agt sempat terpasang di
// URL paket 22 Agt. Rutenya mendarat JED sehingga saudiOrderContradictsRoute
// diam, dan urutan Madinah-dulu dari dokumen asing itu lolos ke kartu.
const JBU1528_FOREIGN_CONTENT = {
  days: [
    { dayNumber: '1', title: 'Sabtu, 29 Agustus 2026', location: 'Jakarta – Madinah' },
    { dayNumber: '2', title: 'Ahad, 30 Agustus 2026', location: 'Madinah' },
    { dayNumber: '5', title: 'Rabu, 02 September 2026', location: 'Madinah - Mekkah' },
  ],
};

test('classifyItineraryDepartureDate: tri-state membedakan cocok, bentrok, dan tak bertanggal', () => {
  assert.equal(classifyItineraryDepartureDate(JBU1600_CONTENT, '2026-12-20'), 'match');
  assert.equal(classifyItineraryDepartureDate(JBU1528_FOREIGN_CONTENT, '2026-08-22'), 'mismatch');
  assert.equal(
    classifyItineraryDepartureDate({ days: [{ title: 'Jakarta - Dubai', location: 'Jakarta - Dubai' }] }, '2026-08-22'),
    'undated'
  );
  assert.equal(classifyItineraryDepartureDate(JBU1600_CONTENT, ''), 'undated');
});

test('itineraryBelongsToOtherSchedule: hanya tanggal bentrok yang dianggap dokumen asing (JBU1528)', () => {
  assert.equal(itineraryBelongsToOtherSchedule(JBU1528_FOREIGN_CONTENT, '2026-08-22'), true);
  // Dokumen yang benar untuk keberangkatan 29 Agt tidak boleh ikut tertuduh.
  assert.equal(itineraryBelongsToOtherSchedule(JBU1528_FOREIGN_CONTENT, '2026-08-29'), false);
  assert.equal(itineraryBelongsToOtherSchedule(JBU1600_CONTENT, '2026-12-20'), false);
});

test('itineraryBelongsToOtherSchedule: PDF tanpa judul bertanggal tidak pernah dituduh asing', () => {
  const undated = {
    days: [
      { dayNumber: '1', title: 'Jakarta - Dubai', location: 'Jakarta - Dubai' },
      { dayNumber: '2', title: 'Dubai - Madinah', location: 'Dubai - Madinah' },
    ],
  };
  assert.equal(itineraryBelongsToOtherSchedule(undated, '2026-08-22'), false);
  assert.equal(itineraryBelongsToOtherSchedule(null, '2026-08-22'), false);
});

test('shouldSuppressJourneyOrder: tanpa kontradiksi tidak pernah menekan, apa pun tanggalnya', () => {
  assert.equal(
    shouldSuppressJourneyOrder({
      order: ['Madinah', 'Umroh'],
      berangkatRute: 'CGK - MED',
      content: { days: [{ title: 'Jakarta – Madinah' }] },
      berangkatTgl: '2026-12-20',
    }),
    false
  );
});
