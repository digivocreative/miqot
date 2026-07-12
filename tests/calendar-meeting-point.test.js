import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDepartureMeetingInfoFromText,
  needsDepartureMeetingEnrichment,
} from '../lib/calendar-meeting-point.js';

test('extracts Kloter 15 meeting point from first-day arrival wording', () => {
  const result = extractDepartureMeetingInfoFromText(`
    Ahad, 12 Juli 2026
    Jakarta - Dubai (Hari 1)
    12.40 : Tiba di Café Zukavia gate 5 terminal 2F Bandara International Soekarno
    Hatta, pembagian idcard, makan siang di café Zukavia
    13.40 : Pengarahan, pembagian paspor, do'a dan foto bersama
    17.40 : Dengan pesawat Emirates Airlines EK 357 berangkat menuju Dubai
    22.30 : Tiba di Dubai, cek in hotel dan istirahat
    Senin, 13 Juli 2026
    Dubai - Medinah (Hari 2)
  `);

  assert.deepEqual(result, {
    jamKumpul: '12.40',
    titikKumpul: 'Café Zukavia Gate 5 Terminal 2F Bandara Internasional Soekarno-Hatta',
  });
});

test('extracts explicit first-day gathering and keeps the complete location', () => {
  const result = extractDepartureMeetingInfoFromText(`
    Jakarta - Jeddah (Hari 1)
    19:40 Rombongan tiba dan berkumpul di Lounge Umrah, Gate 3 Terminal 3 Bandara Soekarno-Hatta
    22:10 Dengan pesawat Saudi Airlines berangkat menuju Jeddah
    Jeddah (Hari 2)
  `);

  assert.deepEqual(result, {
    jamKumpul: '19.40',
    titikKumpul: 'Lounge Umrah, Gate 3 Terminal 3 Bandara Soekarno-Hatta',
  });
});

test('removes operational instructions after the complete meeting location', () => {
  const result = extractDepartureMeetingInfoFromText(`
    Jakarta - Jeddah (Hari 1)
    12.30 : Jamaah berkumpul di Gate 1 tiang A Terminal 3 Bandara International Soekarno Hatta,
    menyerahkan koper dan menerima idcard setelah itu jamaah makan siang
    17.00 : Dengan pesawat Saudi Airlines berangkat menuju Jeddah
    Jeddah (Hari 2)
  `);

  assert.deepEqual(result, {
    jamKumpul: '12.30',
    titikKumpul: 'Gate 1 tiang A Terminal 3 Bandara Internasional Soekarno-Hatta',
  });
});

test('accepts itinerary typo where di is attached to the cafe name', () => {
  const result = extractDepartureMeetingInfoFromText(`
    Jakarta - Jeddah (Hari 1)
    07.05 : Rombongan tiba dan berkumpul dicafe Zukavia gate 5 Terminal 2F Bandara Internasional Soekarno Hatta,
    menyerahkan koper dan menerima idcard
    12.05 : Dengan pesawat Garuda Indonesia jamaah berangkat menuju Jeddah
    Mekkah (Hari 2)
  `);

  assert.deepEqual(result, {
    jamKumpul: '07.05',
    titikKumpul: 'cafe Zukavia Gate 5 Terminal 2F Bandara Internasional Soekarno-Hatta',
  });
});

test('accepts itinerary wording that omits di before the place name', () => {
  const result = extractDepartureMeetingInfoFromText(`
    Jakarta - Jeddah (Hari 1)
    14.05 : Rombongan tiba dan berkumpul Café Zukavia gate 5 Terminal 2F
    Bandara International Soekarno Hatta, makan siang dan istirahat
    19.05 : Dengan pesawat Saudi Airlines jamaah berangkat menuju Jeddah
    Jeddah (Hari 2)
  `);

  assert.deepEqual(result, {
    jamKumpul: '14.05',
    titikKumpul: 'Café Zukavia Gate 5 Terminal 2F Bandara Internasional Soekarno-Hatta',
  });
});

test('uses Hari 0 when the airport gathering happens the night before departure', () => {
  const result = extractDepartureMeetingInfoFromText(`
    Sabtu, 14 November 2026
    Jakarta (Hari 0)
    19.40 : Kumpul di hotel Anara terminal 3 bandara Soekarno Hatta, makan malam
    Ahad, 15 November 2026
    Jakarta - Jeddah (Hari 1)
    00.40 : Jemaah berangkat menuju Jeddah dengan pesawat Saudi Airlines
  `);

  assert.deepEqual(result, {
    jamKumpul: '19.40',
    titikKumpul: 'hotel Anara Terminal 3 bandara Soekarno-Hatta',
  });
});

test('never mistakes a later hotel gathering for the departure meeting point', () => {
  const result = extractDepartureMeetingInfoFromText(`
    Jakarta - Dubai (Hari 1)
    17.40 : Dengan pesawat Emirates Airlines EK 357 berangkat menuju Dubai
    Dubai - Medinah (Hari 2)
    19.00 : Jamaah berkumpul di lobby untuk menuju masjid
  `);

  assert.equal(result, null);
});

test('retries enrichment when either time or meeting point is missing', () => {
  assert.equal(needsDepartureMeetingEnrichment({ jam_kumpul: null, titik_kumpul: null }), true);
  assert.equal(needsDepartureMeetingEnrichment({ jam_kumpul: '13.00', titik_kumpul: null }), true);
  assert.equal(needsDepartureMeetingEnrichment({ jam_kumpul: null, titik_kumpul: 'Terminal 3' }), true);
  assert.equal(needsDepartureMeetingEnrichment({ jam_kumpul: '13.00', titik_kumpul: 'Terminal 3' }), false);
});
