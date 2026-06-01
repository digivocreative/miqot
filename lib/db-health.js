// DB-health canary: fold periodic DB probe results into throttled ops alerts.
//
// Pure state machine — no I/O, no timers — so it is fully unit-testable.
//
// Background: when the Supabase Disk IO burst budget depletes, the DB throttles to
// baseline IOPS and query latency spikes long before the app starts returning 522s
// (incident 2026-06-01). A latency canary catches that onset earlier than a human
// notices the outage. evaluateDbProbe() folds each probe into a small state object
// and decides whether to fire a Telegram alert / recovery notice, with debounce
// (N consecutive bad probes) and re-alert throttling so it never floods the channel.

export const DEFAULT_DB_HEALTH_CONFIG = {
  latencyThresholdMs: 3000,    // a healthy probe is ~200-300ms; >3s ≈ throttling
  badThreshold: 2,             // consecutive bad probes before alerting (debounce)
  realertMs: 60 * 60 * 1000,   // while still degraded, re-alert at most hourly
};

export function freshDbHealthState() {
  return { consecutiveBad: 0, alerting: false, lastAlertAtMs: null };
}

/**
 * Fold one probe result into the health state and decide what to emit.
 *
 * A probe is "bad" when it failed (`ok !== true`) or its latency exceeds the
 * threshold. The first alert fires once `badThreshold` consecutive bad probes are
 * seen; while still degraded it re-fires at most once per `realertMs`; the first
 * healthy probe after an alert emits a single 'recover'.
 *
 * @param {object} state - prior state (freshDbHealthState() shape)
 * @param {{ok:boolean, latencyMs:number, nowMs:number}} probe
 * @param {object} [cfg] - thresholds (DEFAULT_DB_HEALTH_CONFIG shape)
 * @returns {{ state: object, action: ('alert'|'recover'|null), reason: (string|null) }}
 */
export function evaluateDbProbe(state, probe, cfg = DEFAULT_DB_HEALTH_CONFIG) {
  const prev = state || freshDbHealthState();
  const ok = probe?.ok === true;
  const latencyMs = Number(probe?.latencyMs);
  const nowMs = Number(probe?.nowMs);
  const slow = Number.isFinite(latencyMs) && latencyMs > cfg.latencyThresholdMs;
  const bad = !ok || slow;

  if (!bad) {
    const recovered = prev.alerting;
    return {
      state: { consecutiveBad: 0, alerting: false, lastAlertAtMs: prev.lastAlertAtMs },
      action: recovered ? 'recover' : null,
      reason: recovered ? 'DB latency back to normal' : null,
    };
  }

  const consecutiveBad = prev.consecutiveBad + 1;
  const reachedThreshold = consecutiveBad >= cfg.badThreshold;
  const throttleElapsed =
    !Number.isFinite(prev.lastAlertAtMs) ||
    (Number.isFinite(nowMs) && nowMs - prev.lastAlertAtMs >= cfg.realertMs);
  const shouldAlert = reachedThreshold && (!prev.alerting || throttleElapsed);

  return {
    state: {
      consecutiveBad,
      alerting: prev.alerting || shouldAlert,
      lastAlertAtMs: shouldAlert && Number.isFinite(nowMs) ? nowMs : prev.lastAlertAtMs,
    },
    action: shouldAlert ? 'alert' : null,
    reason: shouldAlert
      ? (!ok ? 'DB probe failed (query error/timeout)' : `DB latency ${Math.round(latencyMs)}ms > ${cfg.latencyThresholdMs}ms`)
      : null,
  };
}
