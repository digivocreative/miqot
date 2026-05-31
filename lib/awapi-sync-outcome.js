// Pure decision helper for the AWAPI umroh sync tail. No IO.
// Maps fetch/upsert error counts to an outcome that the core uses to decide
// whether to throw (→ caller falls back to legacy) or return (→ done), and
// whether to fire notifications/CAPI/cleanup and bump last_jamaah_sync_at.
//
// Rules are evaluated in order (first match wins):
//   1. upsertErrors > 0                  → hardfail
//   2. fetchErrors === 0                 → full   (even with 0 rows = no jamaah)
//   3. !anyRowsFetched (fetchErrors > 0) → hardfail (errors and nothing usable)
//   4. otherwise (fetchErrors > 0, rows) → partial

export function classifyAwapiSyncOutcome({ fetchErrors = 0, upsertErrors = 0, anyRowsFetched = false } = {}) {
  if (upsertErrors > 0) {
    return makeOutcome('hardfail', `API upsert failed in ${upsertErrors} batch(es)`);
  }
  if (fetchErrors === 0) {
    return makeOutcome('full', 'all endpoints fetched successfully');
  }
  if (!anyRowsFetched) {
    return makeOutcome('hardfail', `API fetch failed: ${fetchErrors} endpoint(s) failed, no rows fetched`);
  }
  return makeOutcome('partial', `API fetch incomplete: ${fetchErrors} endpoint(s) failed`);
}

function makeOutcome(kind, reason) {
  const full = kind === 'full';
  return {
    kind,
    reason,
    shouldBump: kind === 'full' || kind === 'partial',
    shouldNotify: full,
    shouldCleanup: full,
  };
}
