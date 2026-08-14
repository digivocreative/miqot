import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFallbackFlightState,
  hasReliableFlightTimes,
  scheduledSnapshotDisplayStatus,
} from '../lib/flight-fallback-state.js';

test('missing trustworthy times can never fabricate takeoff', () => {
  assert.equal(hasReliableFlightTimes(null), false);
  assert.equal(hasReliableFlightTimes({ depUTC: null, arrUTC: 1000 }), false);
  assert.equal(hasReliableFlightTimes({ depUTC: 0, arrUTC: 1000, operationalTimeTrusted: false }), false);
  assert.deepEqual(
    computeFallbackFlightState(null, Date.parse('2026-07-10T12:34:00Z')),
    { status: 'unverified', progress: 0 },
  );
});

test('calendar-only fallback is scheduled before departure then requires provider confirmation until well past arrival', () => {
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
    { status: 'unverified', progress: 0 },
  );
  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-11T18:11:00Z')),
    { status: 'unverified', progress: 0 },
  );
});

test('calendar-only fallback presumes landed once arrival plus the grace window has passed', () => {
  // User-approved 2026-08-14: lewat jam landing (plus tenggang 90 menit yang
  // sama dengan pagar klaim provider) kartu tampil "Mendarat", bukan "Perlu
  // Cek" selamanya. Batasnya inklusif: tepat arr+90m sudah dianggap mendarat.
  const times = {
    depUTC: Date.parse('2026-07-11T14:20:00Z'),
    arrUTC: Date.parse('2026-07-11T18:10:00Z'),
  };

  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-11T19:39:59Z')),
    { status: 'unverified', progress: 0 },
  );
  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-11T19:40:00Z')),
    { status: 'landed', progress: 100 },
  );
  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-12T09:00:00Z')),
    { status: 'landed', progress: 100 },
  );
});

test('untrusted times never presume landed, however far past the clock', () => {
  const times = {
    depUTC: Date.parse('2026-07-11T14:20:00Z'),
    arrUTC: Date.parse('2026-07-11T18:10:00Z'),
    operationalTimeTrusted: false,
  };
  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-12T09:00:00Z')),
    { status: 'unverified', progress: 0 },
  );
});

test('Merry stays scheduled before the verified itinerary departure', () => {
  const times = {
    depUTC: Date.parse('2026-07-11T14:20:00Z'),
    arrUTC: Date.parse('2026-07-11T18:10:00Z'),
  };

  assert.deepEqual(
    computeFallbackFlightState(times, Date.parse('2026-07-10T12:34:00Z')),
    { status: 'scheduled', progress: 0 },
  );
});

test('a trusted (anchor) leg time in the future is scheduled; an untrusted leg stays unverified', () => {
  const nowMs = Date.parse('2026-08-15T00:00:00Z');
  const depUTC = Date.parse('2026-08-15T10:00:00Z');
  const arrUTC = Date.parse('2026-08-15T13:00:00Z');

  assert.deepEqual(
    computeFallbackFlightState({ depUTC, arrUTC, operationalTimeTrusted: true }, nowMs),
    { status: 'scheduled', progress: 0 },
  );
  assert.deepEqual(
    computeFallbackFlightState({ depUTC, arrUTC, operationalTimeTrusted: false }, nowMs),
    { status: 'unverified', progress: 0 },
  );
});

test('public scheduled snapshot expires at planned takeoff', () => {
  const depUTC = Date.parse('2026-07-11T14:20:00Z');
  assert.equal(scheduledSnapshotDisplayStatus(depUTC, Date.parse('2026-07-10T13:00:00Z')), 'scheduled');
  assert.equal(scheduledSnapshotDisplayStatus(depUTC, depUTC), 'unverified');
  assert.equal(scheduledSnapshotDisplayStatus(null, Date.parse('2026-07-10T13:00:00Z')), 'unverified');
});
