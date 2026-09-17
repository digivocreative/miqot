// Sync cleanup helpers shared by all 4 sync paths (manual/background × umroh/haji).
// Pure functions — no IO. Caller does the actual Supabase DELETE using the returned list.

export function validateListResponse(html) {
  if (!html || typeof html !== 'string') {
    return { complete: false, reason: 'empty response body' };
  }
  // Legacy PHP pages always end with </html>. Missing closing = truncated mid-stream.
  const tail = html.slice(-4096).toLowerCase();
  if (!tail.includes('</html>') && !tail.includes('</body>')) {
    return { complete: false, reason: 'response missing closing html/body tag (truncated)' };
  }
  return { complete: true };
}

// Decide which rows are safe to delete after a sync run.
// Inputs describe the sync outcome; outputs describe the approved deletions plus
// a decision flag so the caller knows whether to even run DELETE.
export function computeSafeDeletions({
  listComplete,
  fetchedBookingIds,
  successfulBookingIds,
  successfulJamaahPerBooking,
  existingRows,
  maxDeletePercent,
}) {
  const totalExisting = existingRows.length;

  if (!listComplete) {
    return {
      decision: 'skip',
      reason: 'list fetch not complete (truncated or failed)',
      toDelete: [],
      wouldDelete: 0,
      totalExisting,
    };
  }

  const toDelete = [];
  for (const row of existingRows) {
    const inFetched = fetchedBookingIds.has(row.bookingId);
    const inSuccessful = successfulBookingIds.has(row.bookingId);

    if (!inFetched) {
      // Booking no longer in upstream list → safe to delete.
      toDelete.push(row);
      continue;
    }
    if (!inSuccessful) {
      // Booking in list but detail fetch failed → preserve (we can't judge).
      continue;
    }
    // Booking's detail succeeded — check if this specific jamaah was returned.
    const jamaahSet = successfulJamaahPerBooking.get(row.bookingId);
    if (!jamaahSet || !jamaahSet.has(row.jamaahKey)) {
      toDelete.push(row);
    }
  }

  const wouldDelete = toDelete.length;

  // The ratio used to abort outright. It could not tell a truncated upstream list
  // under the ratio (2026-09-17: nila lost 21/68 = 25%) from real cancellations
  // over it — small agents stayed inflated forever (selfi 9/10, indrastuti 1/3).
  // Every planned deletion is now confirmed per booking against AWAPI before it
  // runs (executeUmrohDeletions/executeHajiDeletions → lib/sync-delete-verification.js),
  // so the ratio only flags the plan for the log.
  const overThreshold = totalExisting > 0 && wouldDelete / totalExisting > maxDeletePercent;

  return {
    decision: 'delete',
    reason: wouldDelete === 0
      ? 'no stale rows'
      : `${wouldDelete} stale rows${overThreshold ? ` (over ${Math.round(maxDeletePercent * 100)}% — each verified upstream before delete)` : ''}`,
    toDelete,
    wouldDelete,
    totalExisting,
    overThreshold,
  };
}

// Haji sync reads `bm/0`, which AWAPI answers with EVERY haji jamaah of the agent
// (verified 2026-09-17 across 58 agents: it contains every row of bm/2025..2041 and
// dh/1447..1449, plus waiting-list jamaah with departure year 0 registered before
// 1447 that no per-year list ever returned — aulia HAJ0000821 et al. were deleted
// as "stale" for that reason). The registration-year lists are fetched as a
// cross-check: if any of their rows is missing from bm/0, "0 = all" no longer
// holds upstream and the list must not drive deletions.
export function assessUniversalListCoverage({ universalFetched, universalKeys, crossCheckKeys }) {
  if (!universalFetched) return { complete: false, reason: 'universal list not fetched', missing: [] };
  const missing = [...(crossCheckKeys || [])].filter(key => !universalKeys.has(key));
  if (missing.length > 0) {
    return { complete: false, reason: `${missing.length} registration-list row(s) absent from the universal list`, missing };
  }
  return { complete: true, reason: 'universal list covers every cross-check row', missing: [] };
}
