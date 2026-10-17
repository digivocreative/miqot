import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFallbackFlightState,
  hasReliableFlightTimes,
  scheduleWindowFlightState,
} from '../lib/flight-fallback-state.js';

// User 2026-10-17: "Perlu Cek" tak pernah ditampilkan lagi, dan tanpa konfirmasi
// pelacak kartu tak pernah mengklaim terbang: terjadwal → mendarat (arr + 90m).

test('missing trustworthy times can never fabricate takeoff', () => {
  assert.equal(hasReliableFlightTimes(null), false);
  assert.equal(hasReliableFlightTimes({ depUTC: null, arrUTC: 1000 }), false);
  assert.equal(hasReliableFlightTimes({ depUTC: 0, arrUTC: 1000, operationalTimeTrusted: false }), false);
  assert.deepEqual(
    computeFallbackFlightState(null, Date.parse('2026-07-10T12:34:00Z')),
    { status: 'scheduled', progress: 0 },
  );
});

test('calendar-only fallback stays scheduled through the flight window without tracker confirmation', () => {
  const times = {
    depUTC: Date.parse('2026-07-11T14:20:00Z'),
    arrUTC: Date.parse('2026-07-11T18:10:00Z'),
  };

  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-10T12:34:00Z')),
    { status: 'scheduled', progress: 0 },
  );
  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-11T16:15:00Z')),
    { status: 'scheduled', progress: 0 },
  );
  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-11T18:11:00Z')),
    { status: 'scheduled', progress: 0 },
  );
});

test('calendar-only fallback presumes landed once arrival plus the grace window has passed', () => {
  // User-approved 2026-08-14; batasnya inklusif: tepat arr+90m sudah mendarat.
  const times = {
    depUTC: Date.parse('2026-07-11T14:20:00Z'),
    arrUTC: Date.parse('2026-07-11T18:10:00Z'),
  };

  assert.equal(computeFallbackFlightState(times, Date.parse('2026-07-11T19:39:59Z')).status, 'scheduled');
  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-11T19:40:00Z')),
    { status: 'landed', progress: 100 },
  );
  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-12T09:00:00Z')),
    { status: 'landed', progress: 100 },
  );
});

test('untrusted times stay scheduled — never Perlu Cek, never a fabricated takeoff', () => {
  const nowMs = Date.parse('2026-08-15T00:00:00Z');
  const depUTC = Date.parse('2026-08-15T10:00:00Z');
  const arrUTC = Date.parse('2026-08-15T13:00:00Z');

  assert.deepEqual(
    computeFallbackFlightState({ depUTC, arrUTC, operationalTimeTrusted: true }, nowMs),
    { status: 'scheduled', progress: 0 },
  );
  assert.deepEqual(
    computeFallbackFlightState({ depUTC, arrUTC, operationalTimeTrusted: false }, Date.parse('2026-08-16T09:00:00Z')),
    { status: 'scheduled', progress: 0 },
  );
});

test('schedule window without an arrival clock never presumes landed', () => {
  const depUTC = Date.parse('2026-07-11T14:20:00Z');
  assert.deepEqual(scheduleWindowFlightState(depUTC, null, Date.parse('2026-07-20T13:00:00Z')), { status: 'scheduled', progress: 0 });
  assert.deepEqual(scheduleWindowFlightState(null, null, depUTC), { status: 'scheduled', progress: 0 });
});
