// DB circuit breaker — sheds load when Supabase is unreachable / restarting.
//
// Pure state machine (no I/O, no timers) so it is fully unit-testable, mirroring
// lib/db-health.js. The live holder in server.js folds DB interaction outcomes —
// from the periodic DB-health probe, the background sync loops, and the heaviest
// read endpoints — into this state, and reads isCircuitOpen() to decide whether to
// SKIP a background cycle or FAST-FAIL a heavy read instead of piling more queries
// onto a DB that is mid-restart.
//
// Why this exists (incident 2026-06-02): the DB-health canary already detects an
// outage, but nothing READ its state — so during an ~8-min Supabase platform
// restart every 30-min sync loop, the per-minute custom-domain cron, and every
// per-request handler kept hammering a RESTARTING Postgres at the same cadence,
// turning an 8-min blip into a cascading outage (and ~1.1M journal lines). A breaker
// that sheds load while the DB is down lets the platform recover and snaps back.
//
// States:
//   CLOSED    — healthy, traffic flows.
//   OPEN      — shedding; reached after `failureThreshold` consecutive failures.
//   HALF_OPEN — implicit: once `openCooldownMs` elapses with no new failure,
//               isCircuitOpen() returns false to admit trial traffic; the next
//               recorded outcome re-opens (fail) or closes (success) the breaker.
// A single success closes the breaker so recovery is immediate.

export const DEFAULT_CIRCUIT_CONFIG = {
  failureThreshold: 2, // consecutive failures before the breaker OPENs (debounce flukes)
  openCooldownMs: 30 * 1000, // min time OPEN before a HALF_OPEN trial is admitted
};

// Exponential backoff for a loop that keeps failing against a down DB. Used by the
// sync loops so a cycle that failed because Postgres was 522 does NOT immediately
// re-launch a full heavy sync into a still-restarting DB.
export const DEFAULT_BACKOFF = { baseMs: 60 * 1000, maxMs: 8 * 60 * 1000 };

export function freshCircuitState() {
  return { status: 'closed', consecutiveFailures: 0, openedAtMs: null };
}

/**
 * Fold one DB interaction outcome into the circuit state.
 *
 * Any success fully closes the breaker (immediate recovery). A failure increments
 * the consecutive-failure counter and OPENs once `failureThreshold` is reached;
 * while OPEN, each further failure refreshes `openedAtMs` so the cooldown window
 * restarts — the breaker only admits a trial after a quiet `openCooldownMs`.
 *
 * @param {object} state - prior state (freshCircuitState() shape)
 * @param {{ok:boolean, nowMs:number}} outcome
 * @param {object} [cfg] - DEFAULT_CIRCUIT_CONFIG shape
 * @returns {object} next state
 */
export function recordDbOutcome(state, outcome, cfg = DEFAULT_CIRCUIT_CONFIG) {
  const prev = state || freshCircuitState();
  const ok = outcome?.ok === true;
  const nowMs = Number(outcome?.nowMs);

  if (ok) return freshCircuitState();

  const consecutiveFailures = prev.consecutiveFailures + 1;
  const open = consecutiveFailures >= cfg.failureThreshold;
  return {
    status: open ? 'open' : 'closed',
    consecutiveFailures,
    // Refresh openedAtMs on every failure while open so sustained failures keep the
    // cooldown window from elapsing; fall back to prior value if nowMs is unusable.
    openedAtMs: open ? (Number.isFinite(nowMs) ? nowMs : prev.openedAtMs) : null,
  };
}

/**
 * Is the circuit currently shedding load?
 *
 * Returns true while OPEN and within the cooldown window; once `openCooldownMs`
 * has elapsed since the last failure it returns false to admit a single trial
 * (HALF_OPEN), whose outcome the caller feeds back via recordDbOutcome().
 *
 * @param {object} state
 * @param {number} nowMs
 * @param {object} [cfg]
 * @returns {boolean}
 */
export function isCircuitOpen(state, nowMs, cfg = DEFAULT_CIRCUIT_CONFIG) {
  const s = state || freshCircuitState();
  if (s.status !== 'open') return false;
  if (!Number.isFinite(s.openedAtMs) || !Number.isFinite(nowMs)) return true;
  return nowMs - s.openedAtMs < cfg.openCooldownMs;
}

/**
 * Next exponential-backoff delay. 0/invalid previous → baseMs; otherwise double,
 * capped at maxMs. Pure so the loop can keep the running value in a local var.
 *
 * @param {number} prevMs - previous backoff (0 / NaN on the first failure)
 * @param {object} [cfg] - DEFAULT_BACKOFF shape
 * @returns {number}
 */
export function nextBackoffMs(prevMs, cfg = DEFAULT_BACKOFF) {
  const base = Number.isFinite(cfg.baseMs) && cfg.baseMs > 0 ? cfg.baseMs : DEFAULT_BACKOFF.baseMs;
  const max = Number.isFinite(cfg.maxMs) && cfg.maxMs > 0 ? cfg.maxMs : DEFAULT_BACKOFF.maxMs;
  const prev = Number.isFinite(prevMs) && prevMs > 0 ? prevMs : 0;
  const next = prev === 0 ? base : prev * 2;
  return Math.min(next, max);
}

/**
 * Heuristic: does this error indicate the DB/PostgREST gateway is unreachable
 * (restart / 522 / network) rather than a normal application or scrape error?
 * Used to decide when to trip the breaker + back off vs. treat as a one-off.
 *
 * @param {any} err
 * @returns {boolean}
 */
export function isDbConnectivityError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('521') ||
    msg.includes('522') ||
    msg.includes('523') ||
    msg.includes('524')
  );
}
