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

  if (totalExisting > 0 && wouldDelete / totalExisting > maxDeletePercent) {
    return {
      decision: 'skip',
      reason: `would delete ${wouldDelete}/${totalExisting} rows — exceeds ${Math.round(maxDeletePercent * 100)}% threshold, aborting`,
      toDelete: [],
      wouldDelete,
      totalExisting,
    };
  }

  return {
    decision: 'delete',
    reason: wouldDelete === 0 ? 'no stale rows' : `${wouldDelete} stale rows`,
    toDelete,
    wouldDelete,
    totalExisting,
  };
}
