import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

import {
  DEFAULT_UMROH_PHASE2_TIMES_WIB,
  nextJakartaScheduleDate,
  shouldDeferInlineUmrohPhase2,
} from '../lib/jamaah-phase2-policy.js';

test('nextJakartaScheduleDate returns the 01:00 WIB run when it is still ahead today', () => {
  const now = new Date('2026-05-16T17:30:00.000Z'); // 2026-05-17 00:30 WIB
  const next = nextJakartaScheduleDate(now, DEFAULT_UMROH_PHASE2_TIMES_WIB);

  assert.equal(next.toISOString(), '2026-05-16T18:00:00.000Z');
});

test('nextJakartaScheduleDate returns the 09:00 WIB run after the 01:00 run has passed', () => {
  const now = new Date('2026-05-16T18:30:00.000Z'); // 2026-05-17 01:30 WIB
  const next = nextJakartaScheduleDate(now, DEFAULT_UMROH_PHASE2_TIMES_WIB);

  assert.equal(next.toISOString(), '2026-05-17T02:00:00.000Z');
});

test('nextJakartaScheduleDate rolls to tomorrow after all configured runs passed', () => {
  const now = new Date('2026-05-17T07:01:00.000Z'); // 2026-05-17 14:01 WIB
  const next = nextJakartaScheduleDate(now, DEFAULT_UMROH_PHASE2_TIMES_WIB);

  assert.equal(next.toISOString(), '2026-05-17T18:00:00.000Z');
});

test('default Phase 2 schedule runs before the 09:30 WIB passport reminder', () => {
  assert.deepEqual(DEFAULT_UMROH_PHASE2_TIMES_WIB, ['01:00', '09:00', '14:00']);
});

test('shouldDeferInlineUmrohPhase2 defers only when AWAPI is enabled and available', () => {
  assert.equal(shouldDeferInlineUmrohPhase2({ awapiSyncEnabled: true, awapiKey: 'SM001-secret' }), true);
  assert.equal(shouldDeferInlineUmrohPhase2({ awapiSyncEnabled: false, awapiKey: 'SM001-secret' }), false);
  assert.equal(shouldDeferInlineUmrohPhase2({ awapiSyncEnabled: true, awapiKey: '' }), false);
  assert.equal(shouldDeferInlineUmrohPhase2({ awapiSyncEnabled: true, awapiKey: 'SM001-secret', forceInline: true }), false);
});

test('server wires Phase 2 policy and scheduled enrichment', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /shouldDeferInlineUmrohPhase2/);
  assert.match(server, /runScheduledUmrohPhase2Enrichment/);
  assert.match(server, /scheduleUmrohPhase2Enrichment/);
});

test('server returns current sync state when a manual sync request finds an active sync', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /message: 'Sync sudah berjalan', \.\.\.state/);
});

test('legacy fallback after AWAPI failure forces inline Phase 2 enrichment', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /let awapiFallbackUsed = false/);
  assert.match(server, /awapiFallbackUsed = true/);
  assert.match(server, /forceInline: awapiFallbackUsed/);
});
