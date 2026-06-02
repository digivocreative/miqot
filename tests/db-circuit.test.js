import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CIRCUIT_CONFIG,
  DEFAULT_BACKOFF,
  freshCircuitState,
  recordDbOutcome,
  isCircuitOpen,
  nextBackoffMs,
  isDbConnectivityError,
} from '../lib/db-circuit.js';

const CFG = DEFAULT_CIRCUIT_CONFIG; // failureThreshold 2, openCooldownMs 30s
const T0 = 1_000_000;

// ── recordDbOutcome / state transitions ──

test('fresh state is closed', () => {
  assert.deepEqual(freshCircuitState(), { status: 'closed', consecutiveFailures: 0, openedAtMs: null });
});

test('single failure below threshold stays closed', () => {
  const s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG);
  assert.equal(s.status, 'closed');
  assert.equal(s.consecutiveFailures, 1);
  assert.equal(s.openedAtMs, null);
});

test('reaching failureThreshold opens the breaker and stamps openedAtMs', () => {
  let s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG);
  s = recordDbOutcome(s, { ok: false, nowMs: T0 + 100 }, CFG);
  assert.equal(s.status, 'open');
  assert.equal(s.consecutiveFailures, 2);
  assert.equal(s.openedAtMs, T0 + 100);
});

test('any success immediately closes the breaker (full reset)', () => {
  let s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG);
  s = recordDbOutcome(s, { ok: false, nowMs: T0 + 100 }, CFG);
  assert.equal(s.status, 'open');
  s = recordDbOutcome(s, { ok: true, nowMs: T0 + 200 }, CFG);
  assert.deepEqual(s, { status: 'closed', consecutiveFailures: 0, openedAtMs: null });
});

test('failure while open refreshes openedAtMs (cooldown window restarts)', () => {
  let s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG);
  s = recordDbOutcome(s, { ok: false, nowMs: T0 + 100 }, CFG); // open @ T0+100
  s = recordDbOutcome(s, { ok: false, nowMs: T0 + 5000 }, CFG); // still failing, later
  assert.equal(s.status, 'open');
  assert.equal(s.consecutiveFailures, 3);
  assert.equal(s.openedAtMs, T0 + 5000);
});

test('failure while open with unusable nowMs keeps prior openedAtMs', () => {
  let s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG);
  s = recordDbOutcome(s, { ok: false, nowMs: T0 + 100 }, CFG); // open @ T0+100
  s = recordDbOutcome(s, { ok: false, nowMs: NaN }, CFG);
  assert.equal(s.status, 'open');
  assert.equal(s.openedAtMs, T0 + 100);
});

// ── isCircuitOpen ──

test('isCircuitOpen: closed state is never open', () => {
  assert.equal(isCircuitOpen(freshCircuitState(), T0, CFG), false);
  const s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG); // 1 failure, still closed
  assert.equal(isCircuitOpen(s, T0, CFG), false);
});

test('isCircuitOpen: open within cooldown sheds load', () => {
  let s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG);
  s = recordDbOutcome(s, { ok: false, nowMs: T0 }, CFG); // open @ T0
  assert.equal(isCircuitOpen(s, T0 + 10_000, CFG), true); // 10s < 30s cooldown
});

test('isCircuitOpen: after cooldown elapses, admit a HALF_OPEN trial (returns false)', () => {
  let s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG);
  s = recordDbOutcome(s, { ok: false, nowMs: T0 }, CFG); // open @ T0
  assert.equal(isCircuitOpen(s, T0 + 30_000, CFG), false); // exactly at cooldown → trial
  assert.equal(isCircuitOpen(s, T0 + 45_000, CFG), false);
});

test('isCircuitOpen: open with unusable openedAtMs/nowMs fails safe (stays open)', () => {
  const broken = { status: 'open', consecutiveFailures: 2, openedAtMs: null };
  assert.equal(isCircuitOpen(broken, T0, CFG), true);
  const okState = { status: 'open', consecutiveFailures: 2, openedAtMs: T0 };
  assert.equal(isCircuitOpen(okState, NaN, CFG), true);
});

test('full cycle: open → cooldown trial → success closes, → failure re-opens', () => {
  // open
  let s = recordDbOutcome(freshCircuitState(), { ok: false, nowMs: T0 }, CFG);
  s = recordDbOutcome(s, { ok: false, nowMs: T0 }, CFG);
  assert.equal(isCircuitOpen(s, T0 + 5_000, CFG), true);
  // cooldown passes → trial admitted
  assert.equal(isCircuitOpen(s, T0 + 31_000, CFG), false);
  // trial succeeds → closed
  const closed = recordDbOutcome(s, { ok: true, nowMs: T0 + 31_000 }, CFG);
  assert.equal(closed.status, 'closed');
  assert.equal(isCircuitOpen(closed, T0 + 31_000, CFG), false);
});

// ── nextBackoffMs ──

test('nextBackoffMs: 0/invalid previous → baseMs', () => {
  assert.equal(nextBackoffMs(0), DEFAULT_BACKOFF.baseMs);
  assert.equal(nextBackoffMs(NaN), DEFAULT_BACKOFF.baseMs);
  assert.equal(nextBackoffMs(undefined), DEFAULT_BACKOFF.baseMs);
  assert.equal(nextBackoffMs(-5), DEFAULT_BACKOFF.baseMs);
});

test('nextBackoffMs: doubles and caps at maxMs', () => {
  assert.equal(nextBackoffMs(60_000), 120_000);
  assert.equal(nextBackoffMs(120_000), 240_000);
  assert.equal(nextBackoffMs(240_000), 480_000); // == maxMs (8m)
  assert.equal(nextBackoffMs(480_000), 480_000); // capped
  assert.equal(nextBackoffMs(10_000_000), DEFAULT_BACKOFF.maxMs);
});

// ── isDbConnectivityError ──

test('isDbConnectivityError: matches Supabase-unreachable signatures', () => {
  assert.equal(isDbConnectivityError(new Error('TypeError: fetch failed')), true);
  assert.equal(isDbConnectivityError(new Error('probe timeout')), true);
  assert.equal(isDbConnectivityError('connect ECONNREFUSED 1.2.3.4:443'), true);
  assert.equal(isDbConnectivityError(new Error('getaddrinfo ENOTFOUND db.x.supabase.co')), true);
  assert.equal(isDbConnectivityError(new Error('522: Connection timed out')), true);
  assert.equal(isDbConnectivityError(new Error('socket hang up')), true);
});

test('isDbConnectivityError: rejects ordinary app errors and empty input', () => {
  assert.equal(isDbConnectivityError(new Error('invalid credentials')), false);
  assert.equal(isDbConnectivityError(new Error('row not found')), false);
  assert.equal(isDbConnectivityError(null), false);
  assert.equal(isDbConnectivityError(undefined), false);
  assert.equal(isDbConnectivityError(''), false);
});
