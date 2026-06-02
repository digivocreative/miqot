import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_JAMAAH_UPSERT_BATCH,
  VOLATILE_JAMAAH_KEYS,
  resolveJamaahUpsertBatch,
  stableStringify,
  jamaahUpsertKey,
  jamaahRowUnchanged,
  partitionChangedJamaahRows,
} from '../lib/jamaah-upsert.js';

// ── resolveJamaahUpsertBatch ──────────────────────────────────────────────────
test('batch: default when unset / blank / non-numeric', () => {
  assert.equal(resolveJamaahUpsertBatch({}), DEFAULT_JAMAAH_UPSERT_BATCH);
  assert.equal(resolveJamaahUpsertBatch({ JAMAAH_UPSERT_BATCH: '' }), DEFAULT_JAMAAH_UPSERT_BATCH);
  assert.equal(resolveJamaahUpsertBatch({ JAMAAH_UPSERT_BATCH: 'abc' }), DEFAULT_JAMAAH_UPSERT_BATCH);
});

test('batch: honors a valid override and floors floats', () => {
  assert.equal(resolveJamaahUpsertBatch({ JAMAAH_UPSERT_BATCH: '10' }), 10);
  assert.equal(resolveJamaahUpsertBatch({ JAMAAH_UPSERT_BATCH: '12.9' }), 12);
});

test('batch: rejects zero/negative (never restores the spilling batch) and clamps high', () => {
  assert.equal(resolveJamaahUpsertBatch({ JAMAAH_UPSERT_BATCH: '0' }), DEFAULT_JAMAAH_UPSERT_BATCH);
  assert.equal(resolveJamaahUpsertBatch({ JAMAAH_UPSERT_BATCH: '-5' }), DEFAULT_JAMAAH_UPSERT_BATCH);
  assert.equal(resolveJamaahUpsertBatch({ JAMAAH_UPSERT_BATCH: '9999' }), 100);
});

// ── stableStringify ───────────────────────────────────────────────────────────
test('stableStringify is key-order independent (nested)', () => {
  const a = { x: 1, y: { b: 2, a: 3 }, z: [1, { q: 1, p: 2 }] };
  const b = { z: [1, { p: 2, q: 1 }], y: { a: 3, b: 2 }, x: 1 };
  assert.equal(stableStringify(a), stableStringify(b));
});

test('stableStringify distinguishes real differences and null/undefined', () => {
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
  assert.equal(stableStringify(null), stableStringify(undefined)); // both → "null"
  assert.notEqual(stableStringify(1), stableStringify('1')); // number vs string differ
});

// ── jamaahUpsertKey ───────────────────────────────────────────────────────────
test('jamaahUpsertKey matches the upsert conflict target, lowercased', () => {
  assert.equal(jamaahUpsertKey({ agent_id: 7, id_umroh: 'AB12', jm_id: 'JM9' }), '7_ab12_jm9');
});

// ── jamaahRowUnchanged ────────────────────────────────────────────────────────
test('unchanged only compares the columns being written (partial payload safe)', () => {
  const payload = { agent_id: 1, id_umroh: 'X', jm_id: 'JM1', bayar: 1000 };
  // existing has extra columns (id, created_at) the sync never writes → ignored
  const existing = { id: 99, created_at: 't', agent_id: 1, id_umroh: 'X', jm_id: 'JM1', bayar: 1000 };
  assert.equal(jamaahRowUnchanged(payload, existing), true);
});

test('any written-column difference → changed (no stale data)', () => {
  const payload = { agent_id: 1, id_umroh: 'X', jm_id: 'JM1', bayar: 1500, raw_data: { a: 1 } };
  const existing = { agent_id: 1, id_umroh: 'X', jm_id: 'JM1', bayar: 1000, raw_data: { a: 1 } };
  assert.equal(jamaahRowUnchanged(payload, existing), false);
});

test('synced_at is volatile — a row differing ONLY in synced_at is unchanged (mirrors DB trigger)', () => {
  assert.ok(VOLATILE_JAMAAH_KEYS.has('synced_at'));
  const payload = { jm_id: 'JM1', bayar: 1000, synced_at: '2026-06-02T08:00:00.000Z' };
  const existing = { jm_id: 'JM1', bayar: 1000, synced_at: '2026-05-09T02:42:45.000Z' };
  assert.equal(jamaahRowUnchanged(payload, existing), true);
});

test('a real change alongside a fresh synced_at is still a change', () => {
  const payload = { jm_id: 'JM1', bayar: 1500, synced_at: '2026-06-02T08:00:00.000Z' };
  const existing = { jm_id: 'JM1', bayar: 1000, synced_at: '2026-05-09T02:42:45.000Z' };
  assert.equal(jamaahRowUnchanged(payload, existing), false);
});

test('raw_data is volatile — a row differing only in raw_data (tokenised URLs/timestamps) is unchanged', () => {
  assert.ok(VOLATILE_JAMAAH_KEYS.has('raw_data'));
  const payload = { jm_id: 'JM1', bayar: 1000, raw_data: { dokumen_pernyataan: 'url-AAA', payment_synced_at: 'T1' } };
  const existing = { jm_id: 'JM1', bayar: 1000, raw_data: { dokumen_pernyataan: 'url-BBB', payment_synced_at: 'T2' } };
  assert.equal(jamaahRowUnchanged(payload, existing), true);
});

test('a business-column change is still a change even when raw_data also differs', () => {
  const payload = { jm_id: 'JM1', bayar: 1500, raw_data: { x: 1 } };
  const existing = { jm_id: 'JM1', bayar: 1000, raw_data: { x: 2 } };
  assert.equal(jamaahRowUnchanged(payload, existing), false);
});

test('JSONB key-order difference in a compared column (perlengkapan) is NOT a change', () => {
  const payload = { jm_id: 'JM1', perlengkapan: { koper: 1, madu: 0, sajadah: 1 } };
  const existing = { jm_id: 'JM1', perlengkapan: { sajadah: 1, koper: 1, madu: 0 } };
  assert.equal(jamaahRowUnchanged(payload, existing), true);
});

// ── partitionChangedJamaahRows ────────────────────────────────────────────────
test('partition: skips unchanged, writes new + changed', () => {
  const rows = [
    { agent_id: 1, id_umroh: 'A', jm_id: 'JM1', bayar: 100 }, // unchanged
    { agent_id: 1, id_umroh: 'B', jm_id: 'JM2', bayar: 250 }, // changed (was 200)
    { agent_id: 1, id_umroh: 'C', jm_id: 'JM3', bayar: 300 }, // new (no existing)
  ];
  const existingByKey = new Map([
    ['1_a_jm1', { agent_id: 1, id_umroh: 'A', jm_id: 'JM1', bayar: 100, id: 1 }],
    ['1_b_jm2', { agent_id: 1, id_umroh: 'B', jm_id: 'JM2', bayar: 200, id: 2 }],
  ]);
  const { changed, skippedCount } = partitionChangedJamaahRows(rows, existingByKey);
  assert.equal(skippedCount, 1);
  assert.deepEqual(changed.map((r) => r.id_umroh), ['B', 'C']);
});

test('partition: null existing map → upsert everything (safe fallback)', () => {
  const rows = [{ agent_id: 1, id_umroh: 'A', jm_id: 'JM1', bayar: 100 }];
  const { changed, skippedCount } = partitionChangedJamaahRows(rows, null);
  assert.equal(skippedCount, 0);
  assert.equal(changed.length, 1);
});

test('partition: empty/invalid rows tolerated', () => {
  assert.deepEqual(partitionChangedJamaahRows([], new Map()), { changed: [], skippedCount: 0 });
  assert.deepEqual(partitionChangedJamaahRows(undefined, new Map()), { changed: [], skippedCount: 0 });
});

// ── raw_data-strip is skip-neutral (guards JAMAAH_DIFF_COLUMNS in server.js) ──────
// server.js reads existing rows for the diff WITHOUT raw_data (the heavy jsonb) to cut
// read load. This is only safe if the skip decision is identical with vs. without
// raw_data (and other non-payload columns) present on the existing row. These cases
// pin that property so a future change can't silently make the narrowed read unsafe.
test('partition: stripping raw_data from existing rows does not change skip decision', () => {
  const payload = [
    { agent_id: 1, id_umroh: 'A', jm_id: 'JM1', nama: 'Budi', bayar: 100, sisa: 0, synced_at: 'NEW' },
  ];
  const withRaw = new Map([[jamaahUpsertKey(payload[0]), {
    agent_id: 1, id_umroh: 'A', jm_id: 'JM1', nama: 'Budi', bayar: 100, sisa: 0,
    synced_at: 'OLD', raw_data: { token: 'abc', payment_synced_at: 'OLD' },
  }]]);
  const withoutRaw = new Map([[jamaahUpsertKey(payload[0]), {
    agent_id: 1, id_umroh: 'A', jm_id: 'JM1', nama: 'Budi', bayar: 100, sisa: 0, synced_at: 'OLD',
  }]]);
  const a = partitionChangedJamaahRows(payload, withRaw);
  const b = partitionChangedJamaahRows(payload, withoutRaw);
  // Unchanged business fields → skipped in BOTH cases (synced_at + raw_data ignored).
  assert.equal(a.skippedCount, 1);
  assert.deepEqual(a, b);
});

test('partition: real business change still written whether or not existing has raw_data', () => {
  const payload = [
    { agent_id: 1, id_umroh: 'A', jm_id: 'JM1', nama: 'Budi', bayar: 250, sisa: 0, synced_at: 'NEW' },
  ];
  const withoutRaw = new Map([[jamaahUpsertKey(payload[0]), {
    agent_id: 1, id_umroh: 'A', jm_id: 'JM1', nama: 'Budi', bayar: 100, sisa: 0, synced_at: 'OLD',
  }]]);
  const { changed, skippedCount } = partitionChangedJamaahRows(payload, withoutRaw);
  assert.equal(skippedCount, 0); // bayar 100→250 is a real change → written
  assert.equal(changed.length, 1);
});
