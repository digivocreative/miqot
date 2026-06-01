// Background-sync scheduling helpers — pure & unit-tested.
//
// The umroh background sync re-fetches every agent's jamaah and upserts into the
// `jamaah` table (the largest table in the DB). Running it too frequently — or
// firing a fresh full-fleet cycle on every process restart — generates sustained
// write IO that drained the Supabase Disk IO burst budget (prod incident
// 2026-06-01: a deploy that restarted the service several times triggered
// back-to-back full syncs and bottomed out the budget → DB throttled → 522).
//
// These helpers make the cooldown configurable (SYNC_COOLDOWN_MINUTES) and let the
// loop delay its FIRST cycle when one already completed recently, so repeated
// restarts no longer each kick off an immediate full sync.

export const DEFAULT_SYNC_COOLDOWN_MINUTES = 30;

/**
 * Parse a cooldown expressed in minutes. Falls back to `fallback` for missing,
 * non-numeric, zero, or negative values (so a typo'd env never disables the
 * cooldown and hammers the DB).
 */
export function parseSyncCooldownMinutes(value, fallback = DEFAULT_SYNC_COOLDOWN_MINUTES) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Resolve the sync cooldown in milliseconds from the environment.
 * Reads SYNC_COOLDOWN_MINUTES; defaults to DEFAULT_SYNC_COOLDOWN_MINUTES.
 */
export function parseSyncCooldownMs(env = {}) {
  return parseSyncCooldownMinutes(env.SYNC_COOLDOWN_MINUTES) * 60 * 1000;
}

/**
 * How long to wait before the FIRST sync cycle, given when the last cycle
 * completed. Returns 0 ("sync now") when there is no recent record, when the
 * cooldown has already elapsed, or for any invalid / clock-skewed input.
 * Otherwise returns the remaining cooldown so the loop resumes its normal cadence
 * instead of firing a fresh full-fleet sync on every restart.
 *
 * @param {number} lastSyncAtMs - epoch ms of the last completed cycle (or NaN/null)
 * @param {number} nowMs        - current epoch ms
 * @param {number} cooldownMs   - configured cooldown
 * @returns {number} delay in ms, in the range [0, cooldownMs] (returns the full
 *   cooldown when the last cycle completed at `nowMs`, i.e. elapsed === 0)
 */
export function computeFirstCycleDelayMs(lastSyncAtMs, nowMs, cooldownMs) {
  if (
    !Number.isFinite(lastSyncAtMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(cooldownMs) ||
    cooldownMs <= 0
  ) {
    return 0;
  }
  const elapsed = nowMs - lastSyncAtMs;
  // elapsed < 0 → future timestamp (clock skew): sync now rather than over-delay.
  if (elapsed < 0 || elapsed >= cooldownMs) return 0;
  return cooldownMs - elapsed;
}
