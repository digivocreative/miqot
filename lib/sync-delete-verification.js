// Every umroh/haji jamaah deletion is confirmed against the booking's own detail
// endpoint before it happens. Incident 2026-09-17: the AWAPI list endpoints began
// returning only their newest 50 rows, sync cleanup read the missing tail as
// cancellations and deleted 55 umroh + 46 haji rows that still existed upstream
// (nila 21) — the 30% ratio guard let every agent under the ratio through. A list
// can be wrong in ways no completeness check anticipates; the booking detail
// (agent-scoped: another agent's or a cancelled booking answers with 0 rows) is
// the authority on whether a jamaah is really gone.
//
// Pure orchestration with injected IO so the policy is unit-testable. Server
// wiring: executeUmrohDeletions / executeHajiDeletions in server.js — the single
// choke point every cleanup path (AWAPI, legacy, manual, background) goes through.

export const VERIFY_MAX_BOOKINGS = 25;          // rate limit per cleanup call; the rest waits for the next cycle
export const VERIFY_MAX_PRESENT_BOOKINGS = 3;   // this many "list says gone, detail says present" → list anomaly, stop

const normKey = (key) => String(key ?? '').trim().toLowerCase();

function emptyVerdict() {
  return {
    confirmed: [],      // rows the booking detail no longer lists → safe to delete
    stillPresent: [],   // rows the list omitted but the booking detail still has → keep, anomaly
    unverified: [],     // rows whose booking could not be checked → keep
    deferred: [],       // rows beyond this call's booking budget → next cycle
    aborted: false,
    reason: '',
    checkedBookings: 0,
    presentBookingIds: [],
  };
}

// rows: [{ bookingId, jamaahKey, ... }] — jamaahKey is compared case-insensitively
//   against the keys fetchBookingKeys returns for that booking.
// controlBookingIds: bookings believed present upstream (tried in order). One of
//   them must return rows, proving the detail endpoint answers truthfully right now
//   — otherwise an upstream returning empty detail for everything would "confirm"
//   every deletion.
// fetchBookingKeys: async (bookingId) => Iterable<string> of identity keys upstream.
export async function verifyDeletionsUpstream(rows, {
  controlBookingIds = [],
  fetchBookingKeys,
  maxBookings = VERIFY_MAX_BOOKINGS,
  maxPresentBookings = VERIFY_MAX_PRESENT_BOOKINGS,
} = {}) {
  const verdict = emptyVerdict();
  const byBooking = new Map();
  for (const row of rows || []) {
    if (!row?.bookingId) continue;
    if (!byBooking.has(row.bookingId)) byBooking.set(row.bookingId, []);
    byBooking.get(row.bookingId).push(row);
  }
  if (byBooking.size === 0) return verdict;

  const abort = (reason) => {
    verdict.aborted = true;
    verdict.reason = reason;
    verdict.unverified = [...byBooking.values()].flat();
    verdict.confirmed = [];
    verdict.stillPresent = [];
    verdict.deferred = [];
    return verdict;
  };

  if (typeof fetchBookingKeys !== 'function') return abort('no upstream verifier');

  let controlOk = false;
  let controlNote = 'no control booking available';
  for (const controlId of controlBookingIds.filter(Boolean).slice(0, 3)) {
    try {
      const keys = [...await fetchBookingKeys(controlId)];
      if (keys.length > 0) { controlOk = true; break; }
      controlNote = `control booking ${controlId} returned no rows`;
    } catch (err) {
      controlNote = `control booking ${controlId} failed: ${err.message}`;
    }
  }
  if (!controlOk) return abort(`detail endpoint not proven reliable (${controlNote})`);

  let budget = maxBookings;
  for (const [bookingId, bookingRows] of byBooking) {
    if (budget <= 0) {
      verdict.deferred.push(...bookingRows);
      continue;
    }
    budget--;
    let upstreamKeys;
    try {
      upstreamKeys = new Set([...await fetchBookingKeys(bookingId)].map(normKey));
    } catch {
      verdict.unverified.push(...bookingRows);
      continue;
    }
    verdict.checkedBookings++;
    const present = bookingRows.filter(row => upstreamKeys.has(normKey(row.jamaahKey)));
    verdict.stillPresent.push(...present);
    verdict.confirmed.push(...bookingRows.filter(row => !upstreamKeys.has(normKey(row.jamaahKey))));
    if (present.length > 0) {
      verdict.presentBookingIds.push(bookingId);
      if (verdict.presentBookingIds.length >= maxPresentBookings) {
        const presentIds = verdict.presentBookingIds;
        const aborted = abort(`${presentIds.length} bookings the list omitted still exist upstream — list anomaly, nothing deleted`);
        aborted.presentBookingIds = presentIds;
        return aborted;
      }
    }
  }
  return verdict;
}
