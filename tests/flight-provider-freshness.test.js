import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFreshProviderFlight,
  isLiveProviderFlight,
  providerBackedDisplayStatus,
} from '../lib/flight-provider-freshness.js';

const now = Date.parse('2026-07-10T13:00:00Z');

test('fresh en-route provider row remains live', () => {
  const row = { status: 'en-route', synced_at: '2026-07-10T12:36:44Z' };
  assert.equal(isFreshProviderFlight(row, now), true);
  assert.equal(isLiveProviderFlight(row, now), true);
  assert.equal(providerBackedDisplayStatus(row, now), 'en-route');
});

test('stale active provider row becomes unverified, never a stale operational claim', () => {
  for (const status of ['en-route', 'delayed']) {
    const row = { status, synced_at: '2026-07-10T10:00:00Z' };
    assert.equal(isFreshProviderFlight(row, now), false);
    assert.equal(providerBackedDisplayStatus(row, now), 'unverified');
  }
});

test('confirmed terminal status remains historical but no longer carries Live provenance', () => {
  const row = { status: 'landed', synced_at: '2026-07-10T04:59:00Z' };
  assert.equal(isFreshProviderFlight(row, now), false);
  assert.equal(isLiveProviderFlight(row, now), false);
  assert.equal(providerBackedDisplayStatus(row, now), 'landed');
});

test('recent scheduled and terminal provider rows are evidence, never LIVE tracking', () => {
  for (const status of ['scheduled', 'landed', 'cancelled']) {
    const row = { status, synced_at: '2026-07-10T12:30:00Z' };
    assert.equal(isFreshProviderFlight(row, now), true, status);
    assert.equal(isLiveProviderFlight(row, now), false, status);
  }
});

test('stale provider schedule cannot remain a current scheduled claim', () => {
  const row = {
    status: 'scheduled',
    synced_at: '2026-07-10T06:00:00Z',
    raw_api: { dep_time_ts: Date.parse('2026-07-10T14:00:00Z') / 1000 },
  };
  assert.equal(isFreshProviderFlight(row, now), false);
  assert.equal(providerBackedDisplayStatus(row, now), 'unverified');
});

test('provider scheduled claim expires at departure even while its sync is fresh', () => {
  const base = {
    status: 'scheduled',
    synced_at: '2026-07-10T12:30:00Z',
  };
  assert.equal(providerBackedDisplayStatus({
    ...base,
    raw_api: { dep_time_ts: Date.parse('2026-07-10T14:00:00Z') / 1000 },
  }, now), 'scheduled');
  assert.equal(providerBackedDisplayStatus({
    ...base,
    raw_api: { dep_time_ts: now / 1000 },
  }, now), 'unverified');
  assert.equal(providerBackedDisplayStatus(base, now), 'unverified');
});
