// Pure decision helper: classify an agent's jamaah-sync health from persisted
// fields only. No IO. Single source of truth for THREE consumers:
//   1. the profile "SISTEM INTERNAL" badge (honest connected vs. needs-relogin)
//   2. the admin agent-management watchlist
//   3. the daily Telegram ops alert
//
// Why staleness of last_jamaah_sync_at is a robust, mode-agnostic signal:
// a healthy agent bumps last_jamaah_sync_at on EVERY completed background cycle
// (full or partial), even when 0 rows changed (see lib/awapi-sync-outcome.js →
// shouldBump). An agent whose internal-system login is rejected never obtains an
// AWAPI key (server.js ensureAwapiCredentials → "[awapi/lazy] … login failed"),
// and one whose every endpoint 403s hits `hardfail` (no bump). In both failure
// modes the timestamp simply freezes — so "how long since the last bump" cleanly
// separates flowing from stuck without needing per-mode error columns.

// Background sync pauses overnight (~11h: jobs run ~08–21 WIB) and on shorter
// weekend hours, so the threshold must comfortably exceed the longest legitimate
// quiet stretch. 48h spans a full quiet gap without false-flagging a healthy
// agent, while genuinely stuck agents are stale by days/weeks.
export const SYNC_STALE_HOURS = Number(process.env.JAMAAH_SYNC_STALE_HOURS) || 48;

// Status values (exported for callers that prefer constants over string literals).
export const SYNC_HEALTH = {
  OK: 'ok',                         // credentials present, synced within threshold
  STALE: 'stale',                   // credentials present, sync older than threshold → needs re-login
  PENDING: 'pending',               // credentials present, never synced yet (fresh connect)
  DISCONNECTED: 'disconnected',     // NO credentials now, but synced before → had data, creds lost/removed
  NO_CREDENTIALS: 'no_credentials', // no credentials and never synced — never onboarded
};

const HOUR_MS = 3600 * 1000;

// agent: any object exposing { jamaah_username, jamaah_password, last_jamaah_sync_at }.
// jamaah_password may be a masked placeholder (e.g. '••••••' from the admin list) —
// only its truthiness is used, never its value.
export function classifyJamaahSyncHealth(agent, { now = Date.now(), staleHours = SYNC_STALE_HOURS } = {}) {
  const hasCredentials = !!(agent && agent.jamaah_username && agent.jamaah_password);
  const lastSync = (agent && agent.last_jamaah_sync_at) || null;
  const ts = lastSync == null ? null : (typeof lastSync === 'number' ? lastSync : Date.parse(lastSync));
  const ageHours = (ts != null && Number.isFinite(ts)) ? (now - ts) / HOUR_MS : null;

  if (!hasCredentials) {
    // A prior sync timestamp means the agent WAS connected and accumulating
    // jamaah, so credentials were since removed/lost and their data is now going
    // stale — surface as 'disconnected'. With no history they simply never
    // onboarded — 'no_credentials' (ignored by watchlists).
    if (lastSync) {
      return { status: SYNC_HEALTH.DISCONNECTED, hasCredentials: false, lastSync, ageHours };
    }
    return { status: SYNC_HEALTH.NO_CREDENTIALS, hasCredentials: false, lastSync: null, ageHours: null };
  }

  if (ageHours == null) {
    // Credentials present but no parseable sync yet — first sync pending.
    return { status: SYNC_HEALTH.PENDING, hasCredentials: true, lastSync, ageHours: null };
  }

  const status = ageHours > staleHours ? SYNC_HEALTH.STALE : SYNC_HEALTH.OK;
  return { status, hasCredentials: true, lastSync, ageHours };
}

// Convenience predicate: does this status mean jamaah data has stopped flowing
// and warrants operator attention? Both 'stale' (creds rejected) and
// 'disconnected' (creds gone) stop the data; 'pending' is excluded because a
// just-connected agent legitimately has no sync yet.
export function isSyncStuck(status) {
  return status === SYNC_HEALTH.STALE || status === SYNC_HEALTH.DISCONNECTED;
}
