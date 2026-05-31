import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyAwapiSyncOutcome } from '../lib/awapi-sync-outcome.js';

test('clean fetch with rows → full (notify + cleanup + bump)', () => {
  const o = classifyAwapiSyncOutcome({ fetchErrors: 0, upsertErrors: 0, anyRowsFetched: true });
  assert.equal(o.kind, 'full');
  assert.equal(o.shouldBump, true);
  assert.equal(o.shouldNotify, true);
  assert.equal(o.shouldCleanup, true);
});

test('clean fetch with ZERO rows → full, not hardfail (agent has no jamaah)', () => {
  const o = classifyAwapiSyncOutcome({ fetchErrors: 0, upsertErrors: 0, anyRowsFetched: false });
  assert.equal(o.kind, 'full');
  assert.equal(o.shouldBump, true);
  assert.equal(o.shouldNotify, true);
  assert.equal(o.shouldCleanup, true);
});

test('some endpoints failed but rows fetched → partial (bump only, no notify/cleanup)', () => {
  const o = classifyAwapiSyncOutcome({ fetchErrors: 1, upsertErrors: 0, anyRowsFetched: true });
  assert.equal(o.kind, 'partial');
  assert.equal(o.shouldBump, true);
  assert.equal(o.shouldNotify, false);
  assert.equal(o.shouldCleanup, false);
});

test('fetch errors AND no rows fetched → hardfail (caller falls back to legacy)', () => {
  const o = classifyAwapiSyncOutcome({ fetchErrors: 6, upsertErrors: 0, anyRowsFetched: false });
  assert.equal(o.kind, 'hardfail');
  assert.equal(o.shouldBump, false);
  assert.equal(o.shouldNotify, false);
  assert.equal(o.shouldCleanup, false);
});

test('upsert errors → hardfail even if rows were fetched', () => {
  const o = classifyAwapiSyncOutcome({ fetchErrors: 0, upsertErrors: 2, anyRowsFetched: true });
  assert.equal(o.kind, 'hardfail');
  assert.equal(o.shouldBump, false);
  assert.equal(o.shouldNotify, false);
  assert.equal(o.shouldCleanup, false);
});

test('reason is a non-empty string for every kind', () => {
  for (const args of [
    { fetchErrors: 0, upsertErrors: 0, anyRowsFetched: true },
    { fetchErrors: 1, upsertErrors: 0, anyRowsFetched: true },
    { fetchErrors: 6, upsertErrors: 0, anyRowsFetched: false },
    { fetchErrors: 0, upsertErrors: 1, anyRowsFetched: true },
  ]) {
    const o = classifyAwapiSyncOutcome(args);
    assert.equal(typeof o.reason, 'string');
    assert.ok(o.reason.length > 0);
  }
});
