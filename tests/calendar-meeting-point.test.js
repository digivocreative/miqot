import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDepartureMeetingInfoFromItinerary,
  extractDepartureMeetingInfoFromText,
  needsDepartureMeetingEnrichment,
  resolveCalendarDepartureMeetingInfo,
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

test('extracts meeting info from the structured itinerary shown by the web view', () => {
  const result = extractDepartureMeetingInfoFromItinerary({
    days: [
      {
        dayNumber: '1',
        title: 'Jakarta – Madinah',
        activities: [
          {
            time: '10:50',
            text: 'Rombongan tiba dan berkumpul di Gate 5 Terminal 2F Bandara Soekarno-Hatta, menyerahkan koper dan menerima ID Card.',
          },
          { time: '11:50', text: 'Pengarahan dan pembagian paspor.' },
          { time: '15:50', text: 'Berangkat menuju Madinah dengan pesawat Saudia Airlines SV 821.' },
        ],
      },
      {
        dayNumber: '2',
        title: 'Madinah',
        activities: [
          { time: '07:00', text: 'Jamaah berkumpul di lobby untuk ziarah.' },
        ],
      },
    ],
  });

  assert.deepEqual(result, {
    jamKumpul: '10.50',
    titikKumpul: 'Gate 5 Terminal 2F Bandara Soekarno-Hatta',
  });
});

test('combines Cafe Zukavia with the explicit gate and terminal in today itinerary', () => {
  const content = {
    days: [{
      dayNumber: '1',
      activities: [
        {
          time: '10:50',
          text: 'Rombongan tiba dan berkumpul di Gate 5 Terminal 2F Bandara Soekarno-Hatta, menyerahkan koper, menerima ID Card, beristirahat, dan makan pagi di Cafe Zukavia.',
        },
        { time: '15:50', text: 'Berangkat menuju Madinah dengan pesawat Saudia Airlines SV 821.' },
      ],
    }],
  };

  assert.deepEqual(extractDepartureMeetingInfoFromItinerary(content), {
    jamKumpul: '10.50',
    titikKumpul: 'Cafe Zukavia, Gate 5 Terminal 2F Bandara Soekarno-Hatta',
  });

  assert.deepEqual(extractDepartureMeetingInfoFromText(`
    Jakarta – Madinah (Hari 1)
    10.50 : Rombongan tiba dan berkumpul di gate 5 Terminal 2F Bandara
    Soekarno – Hatta, menyerahkan koper dan menerima ide card setelah itu jamaah
    istirahat dan makan pagi di cafe Zukavia.
    15.50 : Berangkat menuju Madinah dengan pesawat Saudia Airlines SV 821.
    Madinah (Hari 2)
  `), {
    jamKumpul: '10.50',
    titikKumpul: 'cafe Zukavia, Gate 5 Terminal 2F Bandara Soekarno-Hatta',
  });
});

test('structured itinerary includes Hari 0 but never reads gathering activities after Hari 1', () => {
  const result = extractDepartureMeetingInfoFromItinerary(JSON.stringify({
    days: [
      {
        dayNumber: 'Hari 0',
        activities: [
          { time: '19:40', text: 'Kumpul di Hotel Anara Terminal 3 Bandara Soekarno-Hatta.' },
        ],
      },
      {
        dayNumber: 'Hari 1',
        activities: [
          { time: '00:40', text: 'Berangkat menuju Jeddah dengan pesawat Saudi Airlines.' },
        ],
      },
      {
        dayNumber: 'Hari 2',
        activities: [
          { time: '06:00', text: 'Berkumpul di lobby hotel.' },
        ],
      },
    ],
  }));

  assert.deepEqual(result, {
    jamKumpul: '19.40',
    titikKumpul: 'Hotel Anara Terminal 3 Bandara Soekarno-Hatta',
  });
});

test('current itinerary meeting time overrides stale calendar enrichment', () => {
  assert.deepEqual(
    resolveCalendarDepartureMeetingInfo(
      { jam_kumpul: '07.00', titik_kumpul: 'Hotel Anara, Terminal 3' },
      { jamKumpul: '10.50', titikKumpul: 'Gate 5 Terminal 2F Bandara Soekarno-Hatta' },
    ),
    {
      jamKumpul: '10.50',
      titikKumpul: 'Gate 5 Terminal 2F Bandara Soekarno-Hatta',
    },
  );
});

test('background enrichment repairs a complete but stale calendar row without refetching its PDF', async () => {
  const { enrichKeberangkatanWithKumpul } = await import('../calendar-api.js');
  const event = {
    id: '2026-08-08_keberangkatan_22',
    event_date: '2026-08-08',
    jadwal_id: 'JBU1535',
    paket: 'UMRAH PLUS REDSEA 9HR',
    jam: '15.50',
    jam_kumpul: '07.00',
    titik_kumpul: 'Hotel Anara, Terminal 3',
  };
  const itinerary = {
    jadwal_id: 'JBU1535',
    content: {
      days: [{
        dayNumber: '1',
        activities: [
          { time: '10:50', text: 'Rombongan berkumpul di Gate 5 Terminal 2F Bandara Soekarno-Hatta.' },
          { time: '15:50', text: 'Berangkat menuju Madinah dengan pesawat Saudia Airlines.' },
        ],
      }],
    },
  };
  const updates = [];
  const supabase = {
    from(table) {
      const builder = {
        operation: 'select',
        patch: null,
        id: null,
        select() { return this; },
        eq(column, value) {
          if (this.operation === 'update' && column === 'id') this.id = value;
          return this;
        },
        gt() { return this; },
        in() { return this; },
        update(patch) {
          this.operation = 'update';
          this.patch = patch;
          return this;
        },
        then(resolve) {
          if (table === 'calendar_events' && this.operation === 'update') {
            updates.push({ id: this.id, patch: this.patch });
            resolve({ error: null });
          } else if (table === 'calendar_events') {
            resolve({ data: [event], error: null });
          } else if (table === 'itineraries') {
            resolve({ data: [itinerary], error: null });
          } else {
            resolve({ data: [], error: null });
          }
        },
      };
      return builder;
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('PDF must not be fetched'); };
  try {
    await enrichKeberangkatanWithKumpul(supabase);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(updates, [{
    id: event.id,
    patch: {
      jam_kumpul: '10.50',
      titik_kumpul: 'Gate 5 Terminal 2F Bandara Soekarno-Hatta',
    },
  }]);
});

test('retries enrichment when either time or meeting point is missing', () => {
  assert.equal(needsDepartureMeetingEnrichment({ jam_kumpul: null, titik_kumpul: null }), true);
  assert.equal(needsDepartureMeetingEnrichment({ jam_kumpul: '13.00', titik_kumpul: null }), true);
  assert.equal(needsDepartureMeetingEnrichment({ jam_kumpul: null, titik_kumpul: 'Terminal 3' }), true);
  assert.equal(needsDepartureMeetingEnrichment({ jam_kumpul: '13.00', titik_kumpul: 'Terminal 3' }), false);
});
