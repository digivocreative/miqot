import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifiedItineraryFlightTime } from '../lib/flight-itinerary-overrides.js';

const currentSchedule = {
  jadwal_id: 'JBU1496',
  itinerary_source_sha256: 'bbef1cdb9b95198789a9088e65ebd69049ee46ebbd68a258798d443681d844d9',
};

test('Merry SV261 uses the hash-verified current itinerary time', () => {
  assert.deepEqual(
    verifiedItineraryFlightTime({
      eventDate: '2026-07-11',
      flightIata: 'SV261',
      schedule: currentSchedule,
    }),
    {
      depDateLocal: '2026-07-11',
      depLocal: '17:20',
      arrDateLocal: '2026-07-11',
      arrLocal: '21:10',
      durationMin: 230,
      source: 'verified-itinerary',
    },
  );
});

test('itinerary override fails closed when the source document changes', () => {
  assert.equal(
    verifiedItineraryFlightTime({
      eventDate: '2026-07-11',
      flightIata: 'SV261',
      schedule: { ...currentSchedule, itinerary_source_sha256: 'changed' },
    }),
    null,
  );
});
