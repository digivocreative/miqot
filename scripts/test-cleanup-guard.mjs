// Ad-hoc test for lib/sync-cleanup.js — run with `node scripts/test-cleanup-guard.mjs`.
// Tests the pure helpers used by all 4 sync paths before they execute DELETE.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateListResponse,
  computeSafeDeletions,
} from '../lib/sync-cleanup.js';

// ── validateListResponse ──────────────────────────────────────────────────

test('validateListResponse: complete HTML with </html> → complete=true', () => {
  const html = '<html><body><table><tr><td>ok</td></tr></table></body></html>';
  const r = validateListResponse(html);
  assert.equal(r.complete, true);
});

test('validateListResponse: truncated HTML missing </html> → complete=false', () => {
  const html = '<html><body><table><tr><td>ok</td></tr><tr><td>par';
  const r = validateListResponse(html);
  assert.equal(r.complete, false);
  assert.match(r.reason, /trunc|incomplete|closing/i);
});

test('validateListResponse: empty body → complete=false', () => {
  const r = validateListResponse('');
  assert.equal(r.complete, false);
});

test('validateListResponse: null/undefined → complete=false', () => {
  assert.equal(validateListResponse(null).complete, false);
  assert.equal(validateListResponse(undefined).complete, false);
});

// ── computeSafeDeletions ──────────────────────────────────────────────────

const mkRow = (bookingId, jamaahKey) => ({ bookingId, jamaahKey });

test('skip when listComplete=false', () => {
  const r = computeSafeDeletions({
    listComplete: false,
    fetchedBookingIds: new Set(['B1']),
    successfulBookingIds: new Set(['B1']),
    successfulJamaahPerBooking: new Map([['B1', new Set(['J1'])]]),
    existingRows: [mkRow('B1', 'J1'), mkRow('B2', 'J2')],
    maxDeletePercent: 0.3,
  });
  assert.equal(r.decision, 'skip');
  assert.match(r.reason, /list.*(incomplete|not complete)/i);
  assert.deepEqual(r.toDelete, []);
});

test('row in successful booking but jamaah missing → marked for deletion', () => {
  const r = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(['B1']),
    successfulBookingIds: new Set(['B1']),
    successfulJamaahPerBooking: new Map([['B1', new Set(['J1'])]]),
    existingRows: [mkRow('B1', 'J1'), mkRow('B1', 'J2_old')],
    maxDeletePercent: 0.9, // high threshold so not aborted
  });
  assert.equal(r.decision, 'delete');
  assert.deepEqual(r.toDelete, [mkRow('B1', 'J2_old')]);
});

test('row in FAILED booking → PRESERVED (not deleted)', () => {
  const r = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(['B1', 'B2']),
    successfulBookingIds: new Set(['B1']), // B2 detail failed
    successfulJamaahPerBooking: new Map([['B1', new Set(['J1'])]]),
    existingRows: [mkRow('B1', 'J1'), mkRow('B2', 'J_was_there')],
    maxDeletePercent: 0.9,
  });
  assert.equal(r.decision, 'delete');
  assert.deepEqual(r.toDelete, []); // B2 row preserved even though its jamaah not in a successful fetch
});

test('row whose booking is gone from upstream list → marked for deletion', () => {
  const r = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(['B1']),
    successfulBookingIds: new Set(['B1']),
    successfulJamaahPerBooking: new Map([['B1', new Set(['J1'])]]),
    existingRows: [mkRow('B1', 'J1'), mkRow('B_gone', 'Jx')],
    maxDeletePercent: 0.9,
  });
  assert.equal(r.decision, 'delete');
  assert.deepEqual(r.toDelete, [mkRow('B_gone', 'Jx')]);
});

test('abort when wouldDelete > maxDeletePercent', () => {
  // 1 kept, 9 would delete → 90%. Threshold 30%.
  const existing = [
    mkRow('B1', 'J1'),
    ...Array.from({ length: 9 }, (_, i) => mkRow('B_gone_' + i, 'J')),
  ];
  const r = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(['B1']),
    successfulBookingIds: new Set(['B1']),
    successfulJamaahPerBooking: new Map([['B1', new Set(['J1'])]]),
    existingRows: existing,
    maxDeletePercent: 0.3,
  });
  assert.equal(r.decision, 'skip');
  assert.match(r.reason, /exceed|abort|threshold|30/i);
  assert.equal(r.wouldDelete, 9);
  assert.equal(r.totalExisting, 10);
});

test('empty existingRows → no-op delete', () => {
  const r = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(),
    successfulBookingIds: new Set(),
    successfulJamaahPerBooking: new Map(),
    existingRows: [],
    maxDeletePercent: 0.3,
  });
  assert.equal(r.decision, 'delete');
  assert.deepEqual(r.toDelete, []);
  assert.equal(r.wouldDelete, 0);
});

test('legitimate empty list but many existing rows → ABORTS (safety)', () => {
  // Upstream truly returned zero, but DB has 100 rows. This MIGHT be legit
  // (everyone cancelled) or MIGHT be a silent bug. Safer to abort and log.
  const existing = Array.from({ length: 100 }, (_, i) => mkRow('B' + i, 'J'));
  const r = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(),
    successfulBookingIds: new Set(),
    successfulJamaahPerBooking: new Map(),
    existingRows: existing,
    maxDeletePercent: 0.3,
  });
  assert.equal(r.decision, 'skip');
  assert.equal(r.wouldDelete, 100);
});

test('complete empty-list with empty DB → no-op', () => {
  const r = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(),
    successfulBookingIds: new Set(),
    successfulJamaahPerBooking: new Map(),
    existingRows: [],
    maxDeletePercent: 0.3,
  });
  assert.equal(r.decision, 'delete');
  assert.equal(r.wouldDelete, 0);
});

test('complex scenario: mixed succeeded / failed / gone', () => {
  // Upstream list: B1, B2, B3. B1 & B2 detail succeeded. B3 failed.
  // Existing DB: B1/J1 (still there), B1/J_old (not returned — should delete),
  //             B2/J2 (still there), B3/J3 (preserved — booking failed),
  //             B_gone/Jx (delete — not in upstream list),
  //             plus a bunch more to keep percent low.
  const padding = Array.from({ length: 20 }, (_, i) => mkRow('B1', 'pad' + i));
  const existing = [
    mkRow('B1', 'J1'),
    mkRow('B1', 'J_old'),
    mkRow('B2', 'J2'),
    mkRow('B3', 'J3'),
    mkRow('B_gone', 'Jx'),
    ...padding,
  ];
  // Mark the padding rows as successfully returned so they're not deleted.
  const r = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(['B1', 'B2', 'B3']),
    successfulBookingIds: new Set(['B1', 'B2']),
    successfulJamaahPerBooking: new Map([
      ['B1', new Set(['J1', ...padding.map(p => p.jamaahKey)])],
      ['B2', new Set(['J2'])],
    ]),
    existingRows: existing,
    maxDeletePercent: 0.3,
  });
  assert.equal(r.decision, 'delete');
  const toDelSet = new Set(r.toDelete.map(x => `${x.bookingId}/${x.jamaahKey}`));
  assert.ok(toDelSet.has('B1/J_old'), 'B1/J_old should be deleted');
  assert.ok(toDelSet.has('B_gone/Jx'), 'B_gone/Jx should be deleted');
  assert.ok(!toDelSet.has('B3/J3'), 'B3/J3 must be preserved (detail failed)');
  assert.ok(!toDelSet.has('B1/J1'), 'B1/J1 must be preserved (still present)');
  assert.ok(!toDelSet.has('B2/J2'), 'B2/J2 must be preserved (still present)');
});
