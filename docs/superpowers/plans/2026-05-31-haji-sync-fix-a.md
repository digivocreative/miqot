# Haji Sync Fix A — Frozen Label + CAPI-on-Partial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `syncHajiViaApiCore` from freezing the HajiPage "last sync" label on a partial fetch, and stop it from firing Meta CAPI Purchase events on incomplete data.

**Architecture:** Reuse the existing pure helper `classifyAwapiSyncOutcome` (`lib/awapi-sync-outcome.js`, already on `main`). The haji core throws only on `hardfail`; on `partial`/`full` it returns normally and bumps `last_jamaah_haji_sync_at`. CAPI moves out of the per-batch upsert loop and fires once after the throw checks, gated on full success. Haji has no legacy fallback, so there is no flap to fix. Callers are cosmetic-only.

**Tech Stack:** Node.js (ESM), Express, Supabase JS, `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-05-31-haji-sync-fix-a-design.md`
**Branch:** `fix/haji-sync-partial-no-fallback` (worktree `.claude/worktrees/haji-sync-fix`, off `main`)

---

## File Structure

- **Modify** `server.js`:
  - `syncHajiViaApiCore` upsert loop (~6144-6165): remove per-batch CAPI + the per-batch `hajiCapiIds` var.
  - `syncHajiViaApiCore` tail (~6167-6212): replace the two throws with the `classifyAwapiSyncOutcome`-driven structure; gate cleanup/CAPI on full; bump on partial+full; return `partial`.
  - manual `/api/haji/sync` AWAPI response (~10149-10158): add `partial`.
  - background `syncHajiOneAgent` (~15695-15701): add a success log line.
  - **NOTE:** the import `import { classifyAwapiSyncOutcome } from './lib/awapi-sync-outcome.js';` is ALREADY present (line 30, from umroh Fix A on main) — do NOT add it again.
- **Create** `tests/haji-partial-no-fallback.test.js` — source-assertion guard, scoped to the haji core slice.
- **Reused, no change:** `lib/awapi-sync-outcome.js` and `tests/awapi-sync-outcome.test.js` (already on main).

---

## Task 1: Rewire `syncHajiViaApiCore` (remove per-batch CAPI + outcome-driven tail)

**Files:**
- Modify: `server.js` (`syncHajiViaApiCore` upsert loop + tail)
- Test: `tests/haji-partial-no-fallback.test.js`

- [ ] **Step 1: Write the failing guard test**

Create `tests/haji-partial-no-fallback.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const server = readFileSync(join(root.pathname, 'server.js'), 'utf8');

// Scope assertions to the haji core slice — the generic outcome.* patterns also
// appear in the umroh core (syncUmrahViaApiCore), which sits BEFORE this one.
const hajiStart = server.indexOf('async function syncHajiViaApiCore');
const endMarker = server.indexOf('registrationHijriahYears: normalizedRegistrationYears', hajiStart);
assert.ok(hajiStart > 0 && endMarker > hajiStart, 'syncHajiViaApiCore core must be locatable');
const hajiCore = server.slice(hajiStart, endMarker + 100);

test('haji core calls classifyAwapiSyncOutcome', () => {
  assert.match(hajiCore, /classifyAwapiSyncOutcome\(\{ fetchErrors, upsertErrors, anyRowsFetched \}\)/);
});

test('old unconditional haji throws are removed', () => {
  assert.doesNotMatch(hajiCore, /if \(fetchErrors > 0\) \{[\s\S]{0,120}throw new Error\(`Haji API fetch incomplete/);
  assert.doesNotMatch(hajiCore, /if \(upsertErrors > 0\) \{[\s\S]{0,120}throw new Error\(`Haji API upsert failed/);
});

test('haji CAPI is no longer per-batch and is gated on full success', () => {
  assert.doesNotMatch(hajiCore, /upserted \+= batch\.length;\s*\n\s*processCapiPurchases/);
  assert.match(hajiCore, /if \(outcome\.shouldNotify\) \{[\s\S]{0,220}processCapiPurchases\(agentId, slug, 'haji'/);
});

test('haji label bump is gated on shouldBump (partial + full)', () => {
  assert.match(hajiCore, /if \(outcome\.shouldBump\) \{[\s\S]{0,220}last_jamaah_haji_sync_at: now/);
});

test('haji hardfail still throws; core returns partial + ok flags', () => {
  assert.match(hajiCore, /if \(outcome\.kind === 'hardfail'\) \{[\s\S]{0,160}throw new Error/);
  assert.match(hajiCore, /partial: outcome\.kind === 'partial'/);
  assert.match(hajiCore, /ok: outcome\.kind === 'full'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/haji-partial-no-fallback.test.js`
Expected: FAIL — the haji core still has the old per-batch CAPI and unconditional throws; no `outcome.*` usage yet.

- [ ] **Step 3: Remove per-batch CAPI from the upsert loop**

In `server.js`, replace this EXACT block (inside `syncHajiViaApiCore`):

```js
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const hajiCapiIds = batch.map(r => ({ id_haji: r.id_haji, id_jamaah: r.id_jamaah }));
    const { error } = await supabase
      .from('jamaah_haji')
      .upsert(batch, {
        onConflict: 'agent_id,id_haji,id_jamaah',
        defaultToNull: false,
      });
    if (error) {
      upsertErrors++;
      if (!firstUpsertError) firstUpsertError = error.message;
      console.error(`[haji-api/${context}] ${slug} upsert batch error:`, error.message);
    } else {
      upserted += batch.length;
      processCapiPurchases(agentId, slug, 'haji', hajiCapiIds).catch(e =>
        console.error(`[CAPI/haji-api/${context}] Purchase error:`, e.message)
      );
    }
  }
```

with:

```js
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('jamaah_haji')
      .upsert(batch, {
        onConflict: 'agent_id,id_haji,id_jamaah',
        defaultToNull: false,
      });
    if (error) {
      upsertErrors++;
      if (!firstUpsertError) firstUpsertError = error.message;
      console.error(`[haji-api/${context}] ${slug} upsert batch error:`, error.message);
    } else {
      upserted += batch.length;
    }
  }
```

- [ ] **Step 4: Replace the tail (throws + cleanup + bump + return) with the outcome-driven structure**

Replace this EXACT block:

```js
  if (upsertErrors > 0) {
    throw new Error(`Haji API upsert failed in ${upsertErrors} batch(es): ${firstUpsertError || 'unknown error'}`);
  }

  if (fetchErrors > 0) {
    throw new Error(`Haji API fetch incomplete: ${fetchErrors} endpoint(s) failed`);
  }

  const cleanupYears = new Set(normalizedDepartureYears);
  if (!syncingAgents.get(agentId)?.cancelled && cleanupYears.size > 0) {
    const { data: existingRows } = await supabase
      .from('jamaah_haji')
      .select('id_haji, id_jamaah, thn_masehi')
      .eq('agent_id', agentId)
      .in('thn_masehi', [...cleanupYears]);
    const plan = computeSafeDeletions({
      listComplete: true,
      fetchedBookingIds,
      successfulBookingIds,
      successfulJamaahPerBooking,
      existingRows: (existingRows || []).map(r => ({ bookingId: r.id_haji, jamaahKey: r.id_jamaah })),
      maxDeletePercent: 0.3,
    });
    if (plan.decision === 'skip') {
      console.warn(`[haji-api/${context}] ${slug} cleanup skipped: ${plan.reason} (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
    } else if (plan.toDelete.length > 0) {
      const deletedCount = await executeHajiDeletions(slug, agentId, plan.toDelete);
      console.log(`[haji-api/${context}] ${slug}: removed ${deletedCount} stale haji (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
    }
  }

  const { error: bumpErr } = await supabase
    .from('agents')
    .update({ last_jamaah_haji_sync_at: now })
    .eq('id', agentId);
  if (bumpErr) console.warn(`[haji-api/${context}] ${slug} bump last_jamaah_haji_sync_at failed:`, bumpErr.message);
  invalidateStatsCache(agentId);

  return {
    ok: true,
    count: upserted,
    uniqueHaji: fetchedBookingIds.size,
    syncedAt: now,
    departureYears: normalizedDepartureYears,
    registrationHijriahYears: normalizedRegistrationYears,
  };
```

with:

```js
  const anyRowsFetched = rowsByKey.size > 0;
  const outcome = classifyAwapiSyncOutcome({ fetchErrors, upsertErrors, anyRowsFetched });

  // Hard failure → throw. Haji has no legacy fallback, so the caller
  // (syncHajiOneAgent / sync handler) just logs and skips this cycle.
  // Partial/full return normally and bump the label. See
  // docs/superpowers/specs/2026-05-31-haji-sync-fix-a-design.md
  if (outcome.kind === 'hardfail') {
    throw new Error(firstUpsertError ? `${outcome.reason}: ${firstUpsertError}` : outcome.reason);
  }

  // Cleanup: full success only.
  if (outcome.shouldCleanup) {
    const cleanupYears = new Set(normalizedDepartureYears);
    if (!syncingAgents.get(agentId)?.cancelled && cleanupYears.size > 0) {
      const { data: existingRows } = await supabase
        .from('jamaah_haji')
        .select('id_haji, id_jamaah, thn_masehi')
        .eq('agent_id', agentId)
        .in('thn_masehi', [...cleanupYears]);
      const plan = computeSafeDeletions({
        listComplete: true,
        fetchedBookingIds,
        successfulBookingIds,
        successfulJamaahPerBooking,
        existingRows: (existingRows || []).map(r => ({ bookingId: r.id_haji, jamaahKey: r.id_jamaah })),
        maxDeletePercent: 0.3,
      });
      if (plan.decision === 'skip') {
        console.warn(`[haji-api/${context}] ${slug} cleanup skipped: ${plan.reason} (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
      } else if (plan.toDelete.length > 0) {
        const deletedCount = await executeHajiDeletions(slug, agentId, plan.toDelete);
        console.log(`[haji-api/${context}] ${slug}: removed ${deletedCount} stale haji (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
      }
    }
  }

  // Fire CAPI Purchase events once, on full success only (was per-batch before).
  if (outcome.shouldNotify) {
    const hajiCapiIds = allRows.map(r => ({ id_haji: r.id_haji, id_jamaah: r.id_jamaah }));
    processCapiPurchases(agentId, slug, 'haji', hajiCapiIds).catch(e =>
      console.error(`[CAPI/haji-api/${context}] Purchase error:`, e.message)
    );
  }

  // Bump on every completed cycle (partial + full) so the HajiPage label is honest.
  if (outcome.shouldBump) {
    const { error: bumpErr } = await supabase
      .from('agents')
      .update({ last_jamaah_haji_sync_at: now })
      .eq('id', agentId);
    if (bumpErr) console.warn(`[haji-api/${context}] ${slug} bump last_jamaah_haji_sync_at failed:`, bumpErr.message);
    invalidateStatsCache(agentId);
  }

  if (outcome.kind === 'partial') {
    console.warn(`[haji-api/${context}] ${slug}: partial sync — ${outcome.reason}; kept fetched rows, no fallback`);
  }

  return {
    ok: outcome.kind === 'full',
    partial: outcome.kind === 'partial',
    count: upserted,
    uniqueHaji: fetchedBookingIds.size,
    syncedAt: now,
    departureYears: normalizedDepartureYears,
    registrationHijriahYears: normalizedRegistrationYears,
  };
```

- [ ] **Step 5: Run the guard test to verify it passes**

Run: `node --test tests/haji-partial-no-fallback.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 6: Syntax check**

Run: `node --check server.js`
Expected: no output (exit 0).

- [ ] **Step 7: Commit**

```bash
git add server.js tests/haji-partial-no-fallback.test.js
git commit -m "fix(haji-sync): bump label on partial, fire CAPI only on full success"
```

---

## Task 2: Surface `partial` in haji callers (cosmetic)

**Files:**
- Modify: `server.js` (manual `/api/haji/sync` response ~10149-10158; `syncHajiOneAgent` ~15695-15701)

- [ ] **Step 1: Add `partial` to the manual haji response**

In `server.js`, replace this EXACT block:

```js
      return res.json({
        success: true,
        data: {
          initialCount: apiResult.count,
          total: apiResult.count,
          uniqueHaji: apiResult.uniqueHaji,
          syncing: false,
          source: 'awapi',
        },
      });
```

with:

```js
      return res.json({
        success: true,
        data: {
          initialCount: apiResult.count,
          total: apiResult.count,
          uniqueHaji: apiResult.uniqueHaji,
          syncing: false,
          source: 'awapi',
          partial: apiResult.partial || false,
        },
      });
```

- [ ] **Step 2: Add a success log line to `syncHajiOneAgent`**

Replace this EXACT block:

```js
    const result = await syncHajiViaApiCore(agentId, slug, awapiAgent, { context: 'background' });
    syncingAgents.set(agentId, {
      isSyncing: false,
      totalSynced: result.count,
      lastSync: result.syncedAt,
    });
    return { ok: true };
```

with:

```js
    const result = await syncHajiViaApiCore(agentId, slug, awapiAgent, { context: 'background' });
    syncingAgents.set(agentId, {
      isSyncing: false,
      totalSynced: result.count,
      lastSync: result.syncedAt,
    });
    console.log(`[HAJI-API] ${slug}: ${result.partial ? 'partial' : 'complete'} — ${result.count} rows`);
    return { ok: true };
```

- [ ] **Step 3: Syntax check**

Run: `node --check server.js`
Expected: no output (exit 0).

- [ ] **Step 4: Confirm guard test still passes**

Run: `node --test tests/haji-partial-no-fallback.test.js`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "chore(haji-sync): surface partial flag in manual response and bg log"
```

---

## Task 3: Full suite + verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/*.test.js` (Node 22 reads a bare `tests/` as a module path, so use the glob)
Expected: PASS — all tests, including `tests/awapi-sync-outcome.test.js`, `tests/awapi-partial-no-fallback.test.js`, `tests/haji-awapi-sync.test.js`, and the new `tests/haji-partial-no-fallback.test.js`. No failures.

- [ ] **Step 2: Confirm callers untouched in control flow + no stray haji throws**

Run:
```bash
grep -n "syncHajiViaApiCore" server.js
grep -n "Haji API fetch incomplete\|Haji API upsert failed" server.js
```
Expected: `syncHajiViaApiCore` appears 3× (definition ~6081, manual call ~10147, background call ~15695). The `Haji API fetch incomplete` / `Haji API upsert failed` strings should be GONE from `server.js` (moved to the classifier's generic reasons — and the classifier lives in `lib/`, not `server.js`).

- [ ] **Step 3: Record post-deploy verification (do NOT deploy from this plan)**

After merge + deploy (separate, user-initiated), confirm against project `xicthdsuvmwwuvwvvbqa`:
```sql
-- last_jamaah_haji_sync_at should advance even on partial cycles (no agent stuck >2h from a partial).
select slug,
  round(extract(epoch from (now()-last_jamaah_haji_sync_at))/60)::int as age_min
from agents where awapi_key is not null
order by last_jamaah_haji_sync_at asc;
```
Also watch logs: cycles that log `[haji-api/...] partial sync — ...` must NOT be accompanied by `[CAPI/haji-api/...]` Purchase fires in the same cycle.

---

## Notes for the implementer

- The import `import { classifyAwapiSyncOutcome } from './lib/awapi-sync-outcome.js';` is ALREADY present (line ~30). Do NOT add it.
- The pure helper `classifyAwapiSyncOutcome` and its unit tests (`tests/awapi-sync-outcome.test.js`) are already on `main` — do NOT recreate them. This plan only wires haji into the existing helper.
- Do NOT touch `syncUmrahViaApiCore` (umroh core, ~5860) — it already uses the helper; this is the haji core (~6081).
- Do NOT touch the legacy manual haji path (`/api/haji/sync` when `AWAPI_SYNC_ENABLED=false`, ~`server.js:10161+`) or its `last_jamaah_haji_sync_at` bumps — out of scope.
- `rowsByKey`, `firstUpsertError`, `upsertErrors`, `fetchErrors`, `allRows` are all already declared in `syncHajiViaApiCore` — the edits only reference them.
- All work happens in the worktree `.claude/worktrees/haji-sync-fix` on branch `fix/haji-sync-partial-no-fallback`.
