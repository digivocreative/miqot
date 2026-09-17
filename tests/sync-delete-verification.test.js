import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyDeletionsUpstream } from '../lib/sync-delete-verification.js';

// upstream: bookingId -> array of identity keys still listed by the booking detail
function fakeUpstream(upstream, { failing = [] } = {}) {
  const calls = [];
  const fetchBookingKeys = async (bookingId) => {
    calls.push(bookingId);
    if (failing.includes(bookingId)) throw new Error('Upstream 503');
    return upstream[bookingId] || [];
  };
  return { fetchBookingKeys, calls };
}

const row = (bookingId, jamaahKey) => ({ bookingId, jamaahKey });

test('deletes only pax the booking detail no longer lists', async () => {
  const { fetchBookingKeys } = fakeUpstream({
    CTRL: ['jm:a'],
    AIW1: ['jm:jm2'],   // jm1 cancelled, jm2 still booked
    AIW2: [],           // whole booking gone (cancelled / moved to another agent)
  });
  const verdict = await verifyDeletionsUpstream(
    [row('AIW1', 'jm:jm1'), row('AIW1', 'jm:jm2'), row('AIW2', 'jm:jm3')],
    { controlBookingIds: ['CTRL'], fetchBookingKeys },
  );
  assert.deepEqual(verdict.confirmed.map(r => r.jamaahKey), ['jm:jm1', 'jm:jm3']);
  assert.deepEqual(verdict.stillPresent.map(r => r.jamaahKey), ['jm:jm2']);
  assert.equal(verdict.aborted, false);
});

test('2026-09-17 regression: a truncated list cannot delete jamaah the booking detail still has', async () => {
  // nila: list returned 50/73, cleanup planned 21 rows across bookings that all still exist.
  const upstream = { CTRL: ['jm:x'] };
  const planned = [];
  for (let b = 0; b < 10; b++) {
    upstream[`AIW${b}`] = [`jm:${b}a`, `jm:${b}b`];
    planned.push(row(`AIW${b}`, `jm:${b}a`), row(`AIW${b}`, `jm:${b}b`));
  }
  const { fetchBookingKeys, calls } = fakeUpstream(upstream);
  const verdict = await verifyDeletionsUpstream(planned, { controlBookingIds: ['CTRL'], fetchBookingKeys });
  assert.equal(verdict.aborted, true);
  assert.equal(verdict.confirmed.length, 0);
  assert.equal(verdict.unverified.length, planned.length);
  assert.deepEqual(verdict.presentBookingIds, ['AIW0', 'AIW1', 'AIW2']);
  assert.equal(calls.length, 4, 'stops verifying once the anomaly is proven (control + 3 bookings)');
});

test('an anomaly abort discards deletions already confirmed in the same call', async () => {
  const { fetchBookingKeys } = fakeUpstream({ CTRL: ['jm:x'], GONE: [], P1: ['jm:1'], P2: ['jm:2'], P3: ['jm:3'] });
  const verdict = await verifyDeletionsUpstream(
    [row('GONE', 'jm:g'), row('P1', 'jm:1'), row('P2', 'jm:2'), row('P3', 'jm:3')],
    { controlBookingIds: ['CTRL'], fetchBookingKeys },
  );
  assert.equal(verdict.aborted, true);
  assert.deepEqual(verdict.confirmed, []);
});

test('detail endpoint that answers empty for everything cannot confirm deletions (control booking)', async () => {
  const { fetchBookingKeys } = fakeUpstream({});
  const verdict = await verifyDeletionsUpstream([row('AIW1', 'jm:1')], { controlBookingIds: ['CTRL1', 'CTRL2'], fetchBookingKeys });
  assert.equal(verdict.aborted, true);
  assert.match(verdict.reason, /not proven reliable/);
  assert.deepEqual(verdict.confirmed, []);
});

test('falls through to the next control candidate when the first is stale', async () => {
  const { fetchBookingKeys } = fakeUpstream({ CTRL2: ['jm:c'], AIW1: [] });
  const verdict = await verifyDeletionsUpstream([row('AIW1', 'jm:1')], { controlBookingIds: ['STALE', 'CTRL2'], fetchBookingKeys });
  assert.equal(verdict.aborted, false);
  assert.equal(verdict.confirmed.length, 1);
});

test('no control booking or a failing control keeps every row', async () => {
  const { fetchBookingKeys } = fakeUpstream({ AIW1: [] }, { failing: ['CTRL'] });
  for (const controlBookingIds of [[], ['CTRL']]) {
    const verdict = await verifyDeletionsUpstream([row('AIW1', 'jm:1')], { controlBookingIds, fetchBookingKeys });
    assert.equal(verdict.aborted, true);
    assert.equal(verdict.unverified.length, 1);
  }
});

test('a booking whose detail fetch fails is kept; the rest still proceed', async () => {
  const { fetchBookingKeys } = fakeUpstream({ CTRL: ['jm:x'], OK: [] }, { failing: ['DOWN'] });
  const verdict = await verifyDeletionsUpstream([row('DOWN', 'jm:1'), row('OK', 'jm:2')], { controlBookingIds: ['CTRL'], fetchBookingKeys });
  assert.deepEqual(verdict.unverified.map(r => r.bookingId), ['DOWN']);
  assert.deepEqual(verdict.confirmed.map(r => r.bookingId), ['OK']);
});

test('booking budget defers the remainder to the next cycle', async () => {
  const upstream = { CTRL: ['jm:x'] };
  const planned = Array.from({ length: 5 }, (_, i) => row(`B${i}`, `jm:${i}`));
  const { fetchBookingKeys } = fakeUpstream(upstream);
  const verdict = await verifyDeletionsUpstream(planned, { controlBookingIds: ['CTRL'], fetchBookingKeys, maxBookings: 2 });
  assert.equal(verdict.confirmed.length, 2);
  assert.equal(verdict.deferred.length, 3);
});

test('identity keys compare case- and whitespace-insensitively (name-keyed legacy rows too)', async () => {
  const { fetchBookingKeys } = fakeUpstream({ CTRL: ['jm:x'], AIW1: ['JM:JM999', 'nm:siti aminah '] });
  const verdict = await verifyDeletionsUpstream(
    [row('AIW1', 'jm:jm999'), row('AIW1', 'nm:SITI AMINAH')],
    { controlBookingIds: ['CTRL'], fetchBookingKeys },
  );
  assert.equal(verdict.confirmed.length, 0);
  assert.equal(verdict.stillPresent.length, 2);
});

test('computeSafeDeletions no longer aborts over the ratio — it flags the plan for per-booking verification', async () => {
  const { computeSafeDeletions } = await import('../lib/sync-cleanup.js');
  const plan = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(['KEEP']),
    successfulBookingIds: new Set(['KEEP']),
    successfulJamaahPerBooking: new Map([['KEEP', new Set(['jm:1'])]]),
    existingRows: [row('KEEP', 'jm:1'), row('GONE1', 'jm:2'), row('GONE2', 'jm:3')],
    maxDeletePercent: 0.3,
  });
  assert.equal(plan.decision, 'delete');
  assert.equal(plan.overThreshold, true);
  assert.equal(plan.toDelete.length, 2);

  const truncated = computeSafeDeletions({
    listComplete: false,
    fetchedBookingIds: new Set(),
    successfulBookingIds: new Set(),
    successfulJamaahPerBooking: new Map(),
    existingRows: [row('A', 'jm:1')],
    maxDeletePercent: 0.3,
  });
  assert.equal(truncated.decision, 'skip');
});

test('haji universal list (bm/0) only drives cleanup when it covers every cross-check row', async () => {
  const { assessUniversalListCoverage } = await import('../lib/sync-cleanup.js');
  const universalKeys = new Set(['haj1_jm1', 'haj2_jm2', 'haj3_jm3']);
  assert.equal(assessUniversalListCoverage({ universalFetched: true, universalKeys, crossCheckKeys: new Set(['haj2_jm2']) }).complete, true);
  const broken = assessUniversalListCoverage({ universalFetched: true, universalKeys, crossCheckKeys: new Set(['haj2_jm2', 'haj9_jm9']) });
  assert.equal(broken.complete, false);
  assert.deepEqual(broken.missing, ['haj9_jm9']);
  assert.equal(assessUniversalListCoverage({ universalFetched: false, universalKeys: new Set(), crossCheckKeys: new Set() }).complete, false);
});
