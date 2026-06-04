import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWeatherRefreshDue, mergeWeatherResults } from '../lib/weather-cache.js';

const H = 60 * 60 * 1000;
const KEYS = ['makkah', 'madinah', 'istanbul'];
const city = (key, temp) => ({ key, temp });

test('isWeatherRefreshDue: null/undefined syncedAt is due', () => {
  assert.equal(isWeatherRefreshDue(null, 1000, 3 * H), true);
  assert.equal(isWeatherRefreshDue(undefined, 1000, 3 * H), true);
});

test('isWeatherRefreshDue: invalid date string is due', () => {
  assert.equal(isWeatherRefreshDue('bukan-tanggal', Date.UTC(2026, 5, 4), 3 * H), true);
});

test('isWeatherRefreshDue: fresh data is not due', () => {
  const synced = Date.UTC(2026, 5, 4, 9, 0, 0);
  const justBefore = synced + 3 * H - 1;
  assert.equal(isWeatherRefreshDue(new Date(synced).toISOString(), justBefore, 3 * H), false);
});

test('isWeatherRefreshDue: exactly intervalMs old is due', () => {
  const synced = Date.UTC(2026, 5, 4, 9, 0, 0);
  assert.equal(isWeatherRefreshDue(new Date(synced).toISOString(), synced + 3 * H, 3 * H), true);
});

test('mergeWeatherResults: all fresh, canonical order preserved', () => {
  const fresh = [city('istanbul', 20), city('makkah', 40), city('madinah', 38)];
  const merged = mergeWeatherResults(fresh, null, KEYS);
  assert.deepEqual(merged.map((c) => c.key), ['makkah', 'madinah', 'istanbul']);
});

test('mergeWeatherResults: failed city filled from previous', () => {
  const fresh = [city('makkah', 41), city('istanbul', 22)];
  const previous = [city('makkah', 40), city('madinah', 38), city('istanbul', 20)];
  const merged = mergeWeatherResults(fresh, previous, KEYS);
  assert.deepEqual(merged, [city('makkah', 41), city('madinah', 38), city('istanbul', 22)]);
});

test('mergeWeatherResults: city missing everywhere is omitted', () => {
  const merged = mergeWeatherResults([city('makkah', 40)], null, KEYS);
  assert.deepEqual(merged, [city('makkah', 40)]);
});

test('mergeWeatherResults: first run without previous returns fresh only', () => {
  const merged = mergeWeatherResults([city('madinah', 38)], undefined, KEYS);
  assert.deepEqual(merged, [city('madinah', 38)]);
});

test('mergeWeatherResults: key not in cityKeys is dropped', () => {
  const fresh = [city('makkah', 40), city('kota-dihapus', 99)];
  const merged = mergeWeatherResults(fresh, null, KEYS);
  assert.deepEqual(merged, [city('makkah', 40)]);
});

test('isWeatherRefreshDue: Postgres timestamptz +00:00 format parses', () => {
  // PostgREST mengembalikan timestamptz sebagai RFC 3339 dengan offset +00:00 (bukan Z)
  const now = Date.UTC(2026, 5, 4, 12, 0, 0);
  assert.equal(isWeatherRefreshDue('2026-06-04T11:00:00+00:00', now, 3 * H), false);
  assert.equal(isWeatherRefreshDue('2026-06-04T08:00:00+00:00', now, 3 * H), true);
});

test('mergeWeatherResults: null/empty fresh falls back to previous entirely', () => {
  const previous = [city('makkah', 40), city('madinah', 38)];
  assert.deepEqual(mergeWeatherResults(null, previous, KEYS), previous);
  assert.deepEqual(mergeWeatherResults([], previous, KEYS), previous);
});
