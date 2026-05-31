# Umroh Sync Fix A — Stop Legacy Fallback on Partial AWAPI Fetch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the umroh background sync from falling back to a legacy scrape on a *partial* AWAPI fetch, so the "last sync" label stops freezing and the API↔legacy data flap ends.

**Architecture:** Extract a pure decision helper (`classifyAwapiSyncOutcome`) that maps fetch/upsert error counts to `full | partial | hardfail`. `syncUmrahViaApiCore` throws only on `hardfail` (caller falls back to legacy, unchanged); on `partial`/`full` it returns normally. Notifications + CAPI + cleanup run only on `full`; `last_jamaah_sync_at` is bumped on `partial` + `full`. The two callers' control flow (throw→legacy, return→done) is unchanged.

**Tech Stack:** Node.js (ESM), Express, Supabase JS, `node:test` + `node:assert/strict`. AWAPI client in `awapi-client.js`. Pure helpers live in `lib/` and are unit-tested (see `lib/sync-cleanup.js`, `lib/jamaah-phase2-policy.js`).

**Spec:** `docs/superpowers/specs/2026-05-31-umroh-sync-fix-a-design.md`

**Branch:** `fix/umroh-sync-partial-no-fallback` (already created)

---

## File Structure

- **Create** `lib/awapi-sync-outcome.js` — pure `classifyAwapiSyncOutcome(...)`. One responsibility: classify a sync cycle's outcome.
- **Create** `tests/awapi-sync-outcome.test.js` — unit tests for the helper.
- **Create** `tests/awapi-partial-no-fallback.test.js` — source-assertion guard on `server.js` (mirrors `tests/awapi-sync-guard.test.js`).
- **Modify** `server.js`:
  - line ~29: add import of the helper.
  - `syncUmrahViaApiCore` tail (~5977-6038): replace throws with classifier; gate notif/CAPI/cleanup on full; bump on partial+full; return `partial`.
  - background success log (~14642) and manual response (~6215-6224): cosmetic — surface `partial`.

---

## Task 1: Pure outcome classifier + unit tests

**Files:**
- Create: `lib/awapi-sync-outcome.js`
- Test: `tests/awapi-sync-outcome.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/awapi-sync-outcome.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/awapi-sync-outcome.test.js`
Expected: FAIL — `Cannot find module '../lib/awapi-sync-outcome.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/awapi-sync-outcome.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/awapi-sync-outcome.test.js`
Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/awapi-sync-outcome.js tests/awapi-sync-outcome.test.js
git commit -m "feat(sync): add classifyAwapiSyncOutcome pure helper"
```

---

## Task 2: Wire the classifier into `syncUmrahViaApiCore`

**Files:**
- Modify: `server.js` (import line ~29; function tail ~5977-6038)
- Test: `tests/awapi-partial-no-fallback.test.js`

- [ ] **Step 1: Write the failing source-assertion test**

Create `tests/awapi-partial-no-fallback.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;
const server = readFileSync(join(rootPath, 'server.js'), 'utf8');

test('core imports and calls classifyAwapiSyncOutcome', () => {
  assert.match(server, /import \{ classifyAwapiSyncOutcome \} from '\.\/lib\/awapi-sync-outcome\.js'/);
  assert.match(server, /classifyAwapiSyncOutcome\(\{ fetchErrors, upsertErrors, anyRowsFetched \}\)/);
});

test('the old unconditional partial-fetch throw is removed from server.js', () => {
  assert.doesNotMatch(server, /if \(fetchErrors > 0\) \{[\s\S]{0,120}throw new Error\(`API fetch incomplete/);
  assert.doesNotMatch(server, /if \(upsertErrors > 0\) \{[\s\S]{0,120}throw new Error\(`API upsert failed/);
});

test('notify + CAPI + cleanup are gated on the outcome (full only)', () => {
  assert.match(server, /if \(outcome\.shouldNotify\) \{\s*\n\s*queueJamaahSyncNotifications/);
  assert.match(server, /if \(outcome\.shouldCleanup &&/);
  assert.match(server, /if \(outcome\.shouldNotify\) \{[\s\S]{0,200}processCapiPurchases/);
});

test('last_jamaah_sync_at bump is gated on shouldBump (partial + full)', () => {
  assert.match(server, /if \(outcome\.shouldBump\) \{[\s\S]{0,200}last_jamaah_sync_at: now/);
});

test('core returns a partial flag', () => {
  assert.match(server, /partial: outcome\.kind === 'partial'/);
  assert.match(server, /ok: outcome\.kind === 'full'/);
});

test('hardfail still throws so the caller can fall back to legacy', () => {
  assert.match(server, /if \(outcome\.kind === 'hardfail'\) \{[\s\S]{0,160}throw new Error/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/awapi-partial-no-fallback.test.js`
Expected: FAIL — none of the `outcome.*` patterns exist yet; the old throws still match.

- [ ] **Step 3: Add the import**

In `server.js`, immediately after the line:

```js
import { computeSafeDeletions } from './lib/sync-cleanup.js';
```

add:

```js
import { classifyAwapiSyncOutcome } from './lib/awapi-sync-outcome.js';
```

- [ ] **Step 4: Replace the throws + notify call (Edit B)**

In `syncUmrahViaApiCore`, replace this exact block:

```js
  if (upsertErrors > 0) {
    throw new Error(`API upsert failed in ${upsertErrors} batch(es): ${firstUpsertError || 'unknown error'}`);
  }

  if (fetchErrors > 0) {
    throw new Error(`API fetch incomplete: ${fetchErrors} endpoint(s) failed`);
  }

  // Fire notifications only after a fully successful sync. If the throw above
  // triggers a legacy fallback, payment rows already claimed by AWAPI remain
  // protected by raw_data.payment_source.
  queueJamaahSyncNotifications(agentId, syncEvents, `api/${context}/${slug}`);
```

with:

```js
  const anyRowsFetched = rowsByKey.size > 0;
  const outcome = classifyAwapiSyncOutcome({ fetchErrors, upsertErrors, anyRowsFetched });

  // Hard failure → throw so the caller (syncOneAgent / sync handler) falls back
  // to the legacy scrape. Partial/full return normally — no legacy fallback —
  // which is what stops the API<->legacy flap. See
  // docs/superpowers/specs/2026-05-31-umroh-sync-fix-a-design.md
  if (outcome.kind === 'hardfail') {
    throw new Error(firstUpsertError ? `${outcome.reason}: ${firstUpsertError}` : outcome.reason);
  }

  // Fire notifications only on a fully successful sync. On a partial cycle we
  // keep the rows we did fetch and retry next cycle; we never notify on
  // half-complete data (preserves Pattern 8 intent).
  if (outcome.shouldNotify) {
    queueJamaahSyncNotifications(agentId, syncEvents, `api/${context}/${slug}`);
  }
```

- [ ] **Step 5: Gate the cleanup block (Edit C)**

Replace:

```js
  // Cleanup: only run if all years fetched successfully.
  if (listComplete && !syncingAgents.get(agentId)?.cancelled) {
```

with:

```js
  // Cleanup: only on a fully successful sync (shouldCleanup === full).
  if (outcome.shouldCleanup && !syncingAgents.get(agentId)?.cancelled) {
```

- [ ] **Step 6: Gate the CAPI block (Edit D)**

Replace:

```js
  // Fire CAPI Purchase events (DP & Lunas) — fire-and-forget.
  const upsertedIds = rowsForUpsert.map((r) => ({ id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama }));
  processCapiPurchases(agentId, slug, 'umroh', upsertedIds).catch((e) =>
    console.error(`[CAPI/api/${context}] sync error:`, e.message)
  );
```

with:

```js
  // Fire CAPI Purchase events (DP & Lunas) — fire-and-forget. Full success only.
  if (outcome.shouldNotify) {
    const upsertedIds = rowsForUpsert.map((r) => ({ id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama }));
    processCapiPurchases(agentId, slug, 'umroh', upsertedIds).catch((e) =>
      console.error(`[CAPI/api/${context}] sync error:`, e.message)
    );
  }
```

- [ ] **Step 7: Gate the bump + update the return (Edit E)**

Replace:

```js
  // Persist last sync timestamp at agent level (skip_noop_update trigger).
  const { error: bumpErr } = await supabase
    .from('agents')
    .update({ last_jamaah_sync_at: now })
    .eq('id', agentId);
  if (bumpErr) console.warn(`[Sync/api/${context}] ${slug} bump last_jamaah_sync_at failed:`, bumpErr.message);
  invalidateStatsCache(agentId);

  return {
    ok: fetchErrors === 0,
    count: upserted,
    yearsCompleted: keberangkatanYearsCompleted,
    yearsAttempted: yearsToSync.length,
    syncedAt: now,
  };
```

with:

```js
  // Bump last sync timestamp on every completed cycle (partial or full) so the
  // UI "last sync" label reflects reality, not only clean cycles.
  if (outcome.shouldBump) {
    const { error: bumpErr } = await supabase
      .from('agents')
      .update({ last_jamaah_sync_at: now })
      .eq('id', agentId);
    if (bumpErr) console.warn(`[Sync/api/${context}] ${slug} bump last_jamaah_sync_at failed:`, bumpErr.message);
    invalidateStatsCache(agentId);
  }

  if (outcome.kind === 'partial') {
    console.warn(`[Sync/api/${context}] ${slug}: partial sync — ${outcome.reason} (${keberangkatanYearsCompleted}/${yearsToSync.length} keberangkatan years); kept fetched rows, no legacy fallback`);
  }

  return {
    ok: outcome.kind === 'full',
    partial: outcome.kind === 'partial',
    count: upserted,
    yearsCompleted: keberangkatanYearsCompleted,
    yearsAttempted: yearsToSync.length,
    syncedAt: now,
  };
```

- [ ] **Step 8: Run the source-assertion test to verify it passes**

Run: `node --test tests/awapi-partial-no-fallback.test.js`
Expected: PASS — all 6 tests pass.

- [ ] **Step 9: Verify the server still loads (syntax check)**

Run: `node --check server.js`
Expected: no output (exit 0). If it errors, fix the syntax before continuing.

- [ ] **Step 10: Commit**

```bash
git add server.js tests/awapi-partial-no-fallback.test.js
git commit -m "fix(sync): stop legacy fallback on partial AWAPI fetch; bump label on partial"
```

---

## Task 3: Surface `partial` in callers (cosmetic)

**Files:**
- Modify: `server.js` (background success log ~14642; manual response ~6215-6224)

- [ ] **Step 1: Update the background success log**

Replace:

```js
      console.log(`[SYNC/api/bg] ${slug}: complete — ${result.count} rows in ${result.yearsCompleted}/${result.yearsAttempted} years`);
```

with:

```js
      console.log(`[SYNC/api/bg] ${slug}: ${result.partial ? 'partial' : 'complete'} — ${result.count} rows in ${result.yearsCompleted}/${result.yearsAttempted} years`);
```

- [ ] **Step 2: Add `partial` to the manual sync response**

In `syncUmrahViaApi`, replace:

```js
        initialCount: result.count,
        total: result.count,
        syncing: false,
        source: 'awapi',
        yearsCompleted: result.yearsCompleted,
        yearsAttempted: result.yearsAttempted,
```

with:

```js
        initialCount: result.count,
        total: result.count,
        syncing: false,
        source: 'awapi',
        partial: result.partial || false,
        yearsCompleted: result.yearsCompleted,
        yearsAttempted: result.yearsAttempted,
```

- [ ] **Step 3: Syntax check**

Run: `node --check server.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "chore(sync): surface partial flag in bg log and manual sync response"
```

---

## Task 4: Full test suite + verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/`
Expected: PASS — all tests, including the existing `tests/awapi-sync-guard.test.js`, `tests/jamaah-auto-sync.test.js`, `tests/jamaah-phase2-policy.test.js`, and the two new files. No failures.

- [ ] **Step 2: Confirm no other caller of `syncUmrahViaApiCore` was missed**

Run: `grep -n "syncUmrahViaApiCore" server.js`
Expected: exactly three lines — the definition (~5860), the manual wrapper call (~6214), and the background call (~14635). If any other call site exists, verify it tolerates a normal return on partial (it should — partial is a success-shaped return).

- [ ] **Step 3: Record post-deploy verification (do NOT deploy from this plan)**

After this branch is merged and deployed (separate, user-initiated step), confirm the fix with read-only queries against project `xicthdsuvmwwuvwvvbqa`:

```sql
-- (1) Per-agent bump should advance every cycle; the 47-min spread should collapse.
select slug, last_jamaah_sync_at,
  round(extract(epoch from (now()-last_jamaah_sync_at))/60)::int as age_min
from agents
where awapi_key is not null and jamaah_username is not null
order by last_jamaah_sync_at asc;

-- (2) Flap should stop: watch n_tup_upd growth rate on jamaah drop sharply over time.
select relname, n_live_tup, n_tup_upd,
  round(n_tup_upd::numeric / nullif(n_live_tup,0), 0) as upd_per_live_row
from pg_stat_user_tables where relname = 'jamaah';
```

Also watch logs: `[SYNC/api/bg] <slug> aborted, falling back to legacy` frequency should drop, replaced by `[Sync/api/bg] <slug>: partial sync — ...` on flaky cycles.

- [ ] **Step 4: Final commit (only if Step 3 notes were added to a file)**

No commit needed unless you added verification notes to a tracked file.

---

## Notes for the implementer

- **Do not** change `syncOneAgent` (background, ~14633-14650) or the `/api/laporan/sync` handler catch (~6276-6283) control flow. Their existing `try/catch` already does the right thing: a thrown `hardfail` → legacy fallback; a normal return (partial/full) → done. That is the whole point of Approach A.
- **Payment anomaly** (`server.js:5947`) is intentionally left as a throw → legacy fallback. Do not touch it.
- The keyless-agent cohort and the frontend refetch gap are **out of scope** (separate follow-ups noted in the spec).
- The `listComplete` variable is still computed and passed to `computeSafeDeletions`; leave it. When `outcome.shouldCleanup` is true, `listComplete` is necessarily true (both mean `fetchErrors === 0`).
- **Do NOT touch the haji sync core.** There is a structurally identical block in the haji path (`server.js:6151-6156`) with the strings `Haji API upsert failed` / `Haji API fetch incomplete`. The umroh edits in Task 2 match only the umroh strings (no `Haji ` prefix), and the guard test's `doesNotMatch` regex anchors on `` throw new Error(`API `` so it does not match `` `Haji API ``. Leave haji alone — it's out of scope for Fix A.
- The `source: 'awapi'` string also appears at `server.js:~10139` in an unrelated response. The Task 3 Step 2 edit uses the full multi-line `data: { ... }` block, which is unique to `syncUmrahViaApi`, so the match is unambiguous.
