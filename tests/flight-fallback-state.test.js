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

test('calendar-only fallback is scheduled before departure then requires provider confirmation', () => {
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

test('public scheduled snapshot expires at planned takeoff', () => {
  const depUTC = Date.parse('2026-07-11T14:20:00Z');
  assert.equal(scheduledSnapshotDisplayStatus(depUTC, Date.parse('2026-07-10T13:00:00Z')), 'scheduled');
  assert.equal(scheduledSnapshotDisplayStatus(depUTC, depUTC), 'unverified');
  assert.equal(scheduledSnapshotDisplayStatus(null, Date.parse('2026-07-10T13:00:00Z')), 'unverified');
});
