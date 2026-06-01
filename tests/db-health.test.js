import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DB_HEALTH_CONFIG,
  freshDbHealthState,
  evaluateDbProbe,
} from '../lib/db-health.js';

const CFG = DEFAULT_DB_HEALTH_CONFIG; // latency 3000ms, badThreshold 2, realert 1h
const T0 = 1_000_000;

test('healthy probe → no action, state reset', () => {
  const r = evaluateDbProbe(freshDbHealthState(), { ok: true, latencyMs: 200, nowMs: T0 }, CFG);
  assert.equal(r.action, null);
  assert.deepEqual(r.state, { consecutiveBad: 0, alerting: false, lastAlertAtMs: null });
});

test('single slow probe → debounced (no alert yet)', () => {
  const r = evaluateDbProbe(freshDbHealthState(), { ok: true, latencyMs: 5000, nowMs: T0 }, CFG);
  assert.equal(r.action, null);
  assert.equal(r.state.consecutiveBad, 1);
  assert.equal(r.state.alerting, false);
});

test('two consecutive bad probes → alert', () => {
  let s = freshDbHealthState();
  ({ state: s } = evaluateDbProbe(s, { ok: true, latencyMs: 5000, nowMs: T0 }, CFG));
  const r = evaluateDbProbe(s, { ok: true, latencyMs: 6000, nowMs: T0 + 60_000 }, CFG);
  assert.equal(r.action, 'alert');
  assert.match(r.reason, /latency/i);
  assert.equal(r.state.alerting, true);
  assert.equal(r.state.lastAlertAtMs, T0 + 60_000);
});

test('failed probe (ok=false) counts as bad with a failure reason', () => {
  let s = freshDbHealthState();
  ({ state: s } = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 }, CFG));
  const r = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 + 1000 }, CFG);
  assert.equal(r.action, 'alert');
  assert.match(r.reason, /failed/i);
});

test('still degraded within realert window → throttled (no repeat alert)', () => {
  let s = freshDbHealthState();
  ({ state: s } = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 }, CFG));
  ({ state: s } = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 + 1000 }, CFG)); // alert
  const r = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 + 2000 }, CFG); // 1s later
  assert.equal(r.action, null);
  assert.equal(r.state.alerting, true);
  assert.equal(r.state.lastAlertAtMs, T0 + 1000); // unchanged
});

test('still degraded after realert window → re-alert, lastAlertAt advances', () => {
  let s = freshDbHealthState();
  ({ state: s } = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 }, CFG));
  ({ state: s } = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 + 1000 }, CFG)); // alert
  const later = T0 + 1000 + CFG.realertMs;
  const r = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: later }, CFG);
  assert.equal(r.action, 'alert');
  assert.equal(r.state.lastAlertAtMs, later);
});

test('first healthy probe after an alert → single recover, alerting cleared', () => {
  let s = freshDbHealthState();
  ({ state: s } = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 }, CFG));
  ({ state: s } = evaluateDbProbe(s, { ok: false, latencyMs: 50, nowMs: T0 + 1000 }, CFG)); // alert
  const r = evaluateDbProbe(s, { ok: true, latencyMs: 200, nowMs: T0 + 2000 }, CFG);
  assert.equal(r.action, 'recover');
  assert.equal(r.state.alerting, false);
  assert.equal(r.state.consecutiveBad, 0);
  // a subsequent healthy probe is silent
  const r2 = evaluateDbProbe(r.state, { ok: true, latencyMs: 200, nowMs: T0 + 3000 }, CFG);
  assert.equal(r2.action, null);
});

test('latency exactly at threshold is healthy (strict >)', () => {
  const r = evaluateDbProbe(freshDbHealthState(), { ok: true, latencyMs: CFG.latencyThresholdMs, nowMs: T0 }, CFG);
  assert.equal(r.action, null);
  assert.equal(r.state.consecutiveBad, 0);
});

test('NaN latency: healthy iff ok=true', () => {
  const good = evaluateDbProbe(freshDbHealthState(), { ok: true, latencyMs: NaN, nowMs: T0 }, CFG);
  assert.equal(good.state.consecutiveBad, 0);
  const bad = evaluateDbProbe(freshDbHealthState(), { ok: false, latencyMs: NaN, nowMs: T0 }, CFG);
  assert.equal(bad.state.consecutiveBad, 1);
});

test('custom config: badThreshold=1 alerts on first bad probe', () => {
  const cfg = { ...CFG, badThreshold: 1 };
  const r = evaluateDbProbe(freshDbHealthState(), { ok: false, latencyMs: 50, nowMs: T0 }, cfg);
  assert.equal(r.action, 'alert');
});

test('null prior state is tolerated (treated as fresh)', () => {
  const r = evaluateDbProbe(null, { ok: true, latencyMs: 100, nowMs: T0 }, CFG);
  assert.equal(r.action, null);
  assert.deepEqual(r.state, { consecutiveBad: 0, alerting: false, lastAlertAtMs: null });
});
