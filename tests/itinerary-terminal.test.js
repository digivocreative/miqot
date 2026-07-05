import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReturnTerminalFromItinerary, extractReturnTerminalFromText } from '../lib/itinerary-terminal.js';

test('extractReturnTerminalFromItinerary reads arrival terminal on the final return day', () => {
  const result = extractReturnTerminalFromItinerary({
    days: [
      {
        dayNumber: 'Hari 1',
        title: 'Jakarta Jeddah',
        location: 'Jakarta',
        activities: [
          { time: '19:00', text: 'Berkumpul di Terminal 3 Bandara Soekarno-Hatta' },
        ],
      },
      {
        dayNumber: 'Hari 9',
        title: 'Jeddah Jakarta',
        location: 'Jeddah - Jakarta',
        activities: [
          { time: '09:00', text: 'Tiba di Bandara Soekarno-Hatta Jakarta Terminal 3' },
        ],
      },
    ],
  });

  assert.deepEqual(result, { arrivalTerminal: '3', departureTerminal: null });
});

test('extractReturnTerminalFromItinerary falls back to Saudi departure terminal', () => {
  const result = extractReturnTerminalFromItinerary({
    days: [
      {
        dayNumber: 'Hari 1',
        title: 'Keberangkatan',
        activities: [
          { time: '19:00', text: 'Berkumpul di Lounge Terminal 3 Soekarno-Hatta' },
        ],
      },
      {
        dayNumber: 'Hari 12',
        title: 'Kepulangan',
        activities: [
          { time: '22:00', text: 'Menuju Terminal 1 Bandara King Abdul Aziz Jeddah' },
          { time: '08:30', text: 'Tiba kembali di Jakarta' },
        ],
      },
    ],
  });

  assert.deepEqual(result, { arrivalTerminal: null, departureTerminal: '1' });
});

test('extractReturnTerminalFromItinerary ignores first-day departure terminal as return terminal', () => {
  const result = extractReturnTerminalFromItinerary({
    days: [
      {
        dayNumber: 'Hari 1',
        title: 'Keberangkatan',
        location: 'Jakarta - Jeddah',
        activities: [
          { time: '20:00', text: 'Jamaah berkumpul di Terminal 3 Soekarno-Hatta Jakarta' },
        ],
      },
      {
        dayNumber: 'Hari 9',
        title: 'Kepulangan',
        location: 'Jeddah - Jakarta',
        activities: [
          { time: '07:35', text: 'Tiba di Jakarta dan perjalanan selesai' },
        ],
      },
    ],
  });

  assert.deepEqual(result, { arrivalTerminal: null, departureTerminal: null });
});

test('extractReturnTerminalFromText reads terminal 2F from raw PDF return text', () => {
  const result = extractReturnTerminalFromText(`
    Sabtu, 18 Juli 2026
    Mekkah - Jeddah - Jakarta(Hari 14)
    17.25 : Dengan pesawat Saudi Arabia Airlines SV 816 jamaah kembali
    ke tanah air
    Ahad, 19 Juli 2026
    Jakarta (hari 15)
    07.35 : Insya Allah Tiba di terminal 2F Bandara Soekarno - Hatta dengan
    Selamat Dengan mengucapkan Alhamdulillahi Robbil Alamiin Kita sampai
    di Tanah Air.
  `);

  assert.deepEqual(result, { arrivalTerminal: '2F', departureTerminal: null });
});
