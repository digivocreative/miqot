import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SYNC_COOLDOWN_MINUTES,
  parseSyncCooldownMinutes,
  parseSyncCooldownMs,
  computeFirstCycleDelayMs,
} from '../lib/sync-schedule.js';

const MIN = 60 * 1000;

test('parseSyncCooldownMinutes: returns finite positive values as-is', () => {
  assert.equal(parseSyncCooldownMinutes(10), 10);
  assert.equal(parseSyncCooldownMinutes('45'), 45);
  assert.equal(parseSyncCooldownMinutes(0.5), 0.5);
});

test('parseSyncCooldownMinutes: falls back for missing / invalid / non-positive', () => {
  assert.equal(parseSyncCooldownMinutes(undefined), DEFAULT_SYNC_COOLDOWN_MINUTES);
  assert.equal(parseSyncCooldownMinutes(null), DEFAULT_SYNC_COOLDOWN_MINUTES);
  assert.equal(parseSyncCooldownMinutes(''), DEFAULT_SYNC_COOLDOWN_MINUTES);
  assert.equal(parseSyncCooldownMinutes('abc'), DEFAULT_SYNC_COOLDOWN_MINUTES);
  assert.equal(parseSyncCooldownMinutes('NaN'), DEFAULT_SYNC_COOLDOWN_MINUTES);
  assert.equal(parseSyncCooldownMinutes(0), DEFAULT_SYNC_COOLDOWN_MINUTES);
  assert.equal(parseSyncCooldownMinutes(-5), DEFAULT_SYNC_COOLDOWN_MINUTES);
  assert.equal(parseSyncCooldownMinutes(Infinity), DEFAULT_SYNC_COOLDOWN_MINUTES);
});

test('parseSyncCooldownMinutes: honors a custom fallback', () => {
  assert.equal(parseSyncCooldownMinutes(undefined, 15), 15);
  assert.equal(parseSyncCooldownMinutes('oops', 15), 15);
});

test('parseSyncCooldownMs: defaults to 60 minutes when env is empty', () => {
  assert.equal(parseSyncCooldownMs({}), DEFAULT_SYNC_COOLDOWN_MINUTES * MIN);
  assert.equal(parseSyncCooldownMs(), DEFAULT_SYNC_COOLDOWN_MINUTES * MIN);
});

test('parseSyncCooldownMs: SYNC_COOLDOWN_MINUTES overrides the default', () => {
  assert.equal(parseSyncCooldownMs({ SYNC_COOLDOWN_MINUTES: '10' }), 10 * MIN);
  assert.equal(parseSyncCooldownMs({ SYNC_COOLDOWN_MINUTES: '60' }), 60 * MIN);
});

test('parseSyncCooldownMs: invalid env falls back to default (never disables cooldown)', () => {
  assert.equal(parseSyncCooldownMs({ SYNC_COOLDOWN_MINUTES: '0' }), DEFAULT_SYNC_COOLDOWN_MINUTES * MIN);
  assert.equal(parseSyncCooldownMs({ SYNC_COOLDOWN_MINUTES: '-1' }), DEFAULT_SYNC_COOLDOWN_MINUTES * MIN);
  assert.equal(parseSyncCooldownMs({ SYNC_COOLDOWN_MINUTES: 'abc' }), DEFAULT_SYNC_COOLDOWN_MINUTES * MIN);
});

test('computeFirstCycleDelayMs: no/invalid last-sync timestamp → sync now (0)', () => {
  assert.equal(computeFirstCycleDelayMs(NaN, 1_000_000, 30 * MIN), 0);
  assert.equal(computeFirstCycleDelayMs(null, 1_000_000, 30 * MIN), 0);
  assert.equal(computeFirstCycleDelayMs(undefined, 1_000_000, 30 * MIN), 0);
});

test('computeFirstCycleDelayMs: cooldown already elapsed → sync now (0)', () => {
  const now = 100 * MIN;
  assert.equal(computeFirstCycleDelayMs(now - 31 * MIN, now, 30 * MIN), 0);
  // exactly at the boundary counts as elapsed
  assert.equal(computeFirstCycleDelayMs(now - 30 * MIN, now, 30 * MIN), 0);
});

test('computeFirstCycleDelayMs: recent cycle → wait the remaining cooldown', () => {
  const now = 100 * MIN;
  assert.equal(computeFirstCycleDelayMs(now - 5 * MIN, now, 30 * MIN), 25 * MIN);
  assert.equal(computeFirstCycleDelayMs(now, now, 30 * MIN), 30 * MIN);
});

test('computeFirstCycleDelayMs: future timestamp (clock skew) → sync now (0)', () => {
  const now = 100 * MIN;
  assert.equal(computeFirstCycleDelayMs(now + 5 * MIN, now, 30 * MIN), 0);
});

test('computeFirstCycleDelayMs: non-positive / invalid cooldown → 0', () => {
  const now = 100 * MIN;
  assert.equal(computeFirstCycleDelayMs(now - MIN, now, 0), 0);
  assert.equal(computeFirstCycleDelayMs(now - MIN, now, -1), 0);
  assert.equal(computeFirstCycleDelayMs(now - MIN, now, NaN), 0);
  assert.equal(computeFirstCycleDelayMs(now - MIN, NaN, 30 * MIN), 0);
});

test('computeFirstCycleDelayMs: result is always within [0, cooldownMs]', () => {
  const now = 1_000 * MIN;
  const cooldown = 30 * MIN;
  for (const ageMin of [0, 1, 5, 15, 29, 29.999, 30, 31, 1000]) {
    const d = computeFirstCycleDelayMs(now - ageMin * MIN, now, cooldown);
    assert.ok(d >= 0 && d <= cooldown, `delay ${d} out of range for age ${ageMin}m`);
  }
});
