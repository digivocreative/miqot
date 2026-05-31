# Haji Fix A — frozen "last sync" label + CAPI-on-partial in `syncHajiViaApiCore`

**Date:** 2026-05-31
**Branch:** `fix/haji-sync-partial-no-fallback` (worktree `.claude/worktrees/haji-sync-fix`, off `main`)
**Status:** Approved design, pending implementation plan
**Related:** `project_sync_bug_patterns.md` Pattern 9 (umroh equivalent); reuses `lib/awapi-sync-outcome.js` from umroh Fix A.

---

## Problem

`syncHajiViaApiCore` (`server.js:6081-6211`) has the same tail structure as the umroh core, so it carries two issues:

1. **Frozen "last sync" label (same as Pattern 9).** The `last_jamaah_haji_sync_at` bump (`server.js:6200`) sits **after** `if (fetchErrors > 0) throw "Haji API fetch incomplete"` (`6172`). On a partial fetch the function throws before the bump, so the timestamp freezes. The label is user-visible: `HajiPage.tsx:905` "Sync: …" ← `/api/haji/stats` ← `agents.last_jamaah_haji_sync_at`.

2. **CAPI Purchase events fire on partial data (haji-specific).** `processCapiPurchases(... 'haji' ...)` is called **per-batch inside the upsert loop** (`server.js:6161`), *before* the throw checks. So on a cycle that ultimately throws (partial fetch), Meta Purchase events have already fired for the batches that upserted — on incomplete data. (Umroh, even pre-Fix-A, fired CAPI only after the throw checks.)

### What is NOT a problem for haji
- **No API↔legacy flap.** `syncHajiOneAgent` (`server.js:15666-15715`) has **no legacy fallback** — on throw it logs and returns `{error}`. The manual caller (`/api/haji/sync` AWAPI branch, `server.js:10138-10158`) also has no legacy fallback. So nothing reverts API-written rows.

### Evidence (prod, server time 2026-05-31 ~12:57 UTC)
- Frozen-label bug is **latent**: of 30 keyed agents, **29 had a fresh label (<45 min)**, 1 stale >2h, 0 stale >1d — haji cycles mostly succeed fully, so the bump usually happens. The bug bites only an agent that hits a partial-fetch cycle.
- **No active flap:** for every agent, `max(jamaah_haji.synced_at)` was hours old (07:32–08:47) while the bump was recent (0–23 min) — rows are stable, not rewritten (the `skip_noop_update_jamaah_haji` trigger works). `jamaah_haji` `n_tup_upd ≈ 859×` live rows is historical accumulation, not a current flap.

---

## Decisions (inherited from umroh Fix A + haji-specific, user-approved)

1. **Reuse `classifyAwapiSyncOutcome`** (`lib/awapi-sync-outcome.js`) — do not duplicate. Same `{fetchErrors, upsertErrors, anyRowsFetched}` → `{kind, reason, shouldBump, shouldNotify, shouldCleanup}`.
2. **Throw only on `hardfail`** (upsert error / all endpoints failed / no rows). On `partial`/`full`, return normally. (No legacy fallback exists; a hardfail throw is just caught/logged by the caller, same as today.)
3. **CAPI only on full success**, fired **once after the throw checks** (not per-batch). Move it out of the upsert loop.
4. **Bump `last_jamaah_haji_sync_at` on `partial` + `full`** (label honesty). Single column; no migration.
5. **Cleanup only on `full`** (already effectively true today since cleanup sits post-throw). Gate it on `outcome.shouldCleanup` for clarity.
6. **Scope = AWAPI core only.** The legacy manual haji path (`/api/haji/sync` when `AWAPI_SYNC_ENABLED=false`, `server.js:10161+`) is dormant in prod and untouched. Mirrors umroh Fix A.

---

## Design (Approach A — minimal core-tail change, reuse helper)

### Key insight: callers already correct (cosmetic-only)
- Background `syncHajiOneAgent` (`server.js:15695-15704`): `try { result = core(); set state; return } catch { log; return {error} }`. A `partial` return → success path (no fallback). A `hardfail` throw → caught and logged. No control-flow change.
- Manual `/api/haji/sync` AWAPI branch (`server.js:10147-10158`): `result = core(); return res.json(...)`; a throw propagates to the handler's outer `catch` → 500. No control-flow change.

### Component 1 — `syncHajiViaApiCore` upsert loop (`server.js:6144-6165`)
Remove the per-batch CAPI call. Accumulate nothing extra — CAPI IDs are derived from `allRows` after success (mirrors umroh's `upsertedIds`).

Before (per-batch CAPI inside the loop):
```js
    } else {
      upserted += batch.length;
      processCapiPurchases(agentId, slug, 'haji', hajiCapiIds).catch(e =>
        console.error(`[CAPI/haji-api/${context}] Purchase error:`, e.message)
      );
    }
```
After (no CAPI inside the loop; `hajiCapiIds` per-batch var also removed):
```js
    } else {
      upserted += batch.length;
    }
```
(The `const hajiCapiIds = batch.map(...)` line at `6148` is removed since CAPI now fires once at the end from `allRows`.)

### Component 2 — `syncHajiViaApiCore` tail (`server.js:6167-6211`)
Replace the two throws + cleanup gate + bump + return with the outcome-driven structure:

```js
  const anyRowsFetched = rowsByKey.size > 0;
  const outcome = classifyAwapiSyncOutcome({ fetchErrors, upsertErrors, anyRowsFetched });

  // Hard failure → throw. There is no legacy fallback for haji, so the caller
  // (syncHajiOneAgent / sync handler) just logs and skips this cycle.
  // Partial/full return normally and bump the label. See
  // docs/superpowers/specs/2026-05-31-haji-sync-fix-a-design.md
  if (outcome.kind === 'hardfail') {
    throw new Error(firstUpsertError ? `${outcome.reason}: ${firstUpsertError}` : outcome.reason);
  }

  // Cleanup + CAPI only on a fully successful sync.
  if (outcome.shouldCleanup) {
    const cleanupYears = new Set(normalizedDepartureYears);
    if (!syncingAgents.get(agentId)?.cancelled && cleanupYears.size > 0) {
      // ... existing cleanup block unchanged (computeSafeDeletions / executeHajiDeletions) ...
    }
  }

  if (outcome.shouldNotify) {
    // Fire CAPI Purchase events once, on full success only (DP & Lunas).
    const hajiCapiIds = allRows.map((r) => ({ id_haji: r.id_haji, id_jamaah: r.id_jamaah }));
    processCapiPurchases(agentId, slug, 'haji', hajiCapiIds).catch((e) =>
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

Notes:
- The existing cleanup block (`computeSafeDeletions` with `listComplete: true`, `executeHajiDeletions`) is wrapped unchanged inside `if (outcome.shouldCleanup)`. `listComplete: true` stays hardcoded — it is only reached on `full` now, where it is correct.
- `firstUpsertError` is already declared in the function (same as umroh).

### Component 3 — callers (cosmetic)
- Manual response (`server.js:10149-10157`): add `partial: apiResult.partial || false,` to the `data` object.
- Background `syncHajiOneAgent` (`server.js:15695-15701`) has **no** success log line today (it sets state and `return { ok: true }`). Add one before the `return { ok: true }`: `console.log(\`[HAJI-API] ${slug}: ${result.partial ? 'partial' : 'complete'} — ${result.count} rows\`);`

### Data flow
```
fetch endpoints → upsert batches (NO CAPI inside loop)
anyRowsFetched = rowsByKey.size > 0
outcome = classifyAwapiSyncOutcome({fetchErrors, upsertErrors, anyRowsFetched})
  ├── hardfail → throw ───────→ caller logs, skips cycle (no legacy fallback)
  ├── partial  → bump only ───→ caller success, no CAPI/cleanup
  └── full     → cleanup + CAPI(once) + bump → caller success
```

### Error handling
- Hardfail throw → caught by `syncHajiOneAgent` (logs `[HAJI-API] <slug> error`) or the manual handler (500). No bump, no partial data side effects.
- Partial → rows from failed endpoints keep prior DB values this cycle; refreshed next clean cycle.
- CAPI uses deterministic `event_id` (per memory: `${agentId}-${id}-${phase}`), so firing once at end vs per-batch does not double-count in Meta.

---

## Testing (`node:test`)

1. **`classifyAwapiSyncOutcome` is already unit-tested** (`tests/awapi-sync-outcome.test.js`, on main). No new unit tests for the helper.
2. **`tests/haji-partial-no-fallback.test.js`** — source-assertion guard on `server.js` (mirror `tests/awapi-partial-no-fallback.test.js`):
   - `syncHajiViaApiCore` calls `classifyAwapiSyncOutcome({ fetchErrors, upsertErrors, anyRowsFetched })`.
   - The old unconditional `if (fetchErrors > 0) { throw ... 'Haji API fetch incomplete' }` and `if (upsertErrors > 0) { throw ... 'Haji API upsert failed' }` blocks are gone (`assert.doesNotMatch`).
   - `processCapiPurchases(... 'haji' ...)` is **no longer inside the upsert loop** and is gated on `outcome.shouldNotify` (assert it appears within an `if (outcome.shouldNotify)` block; assert the per-batch invocation pattern is gone).
   - The `last_jamaah_haji_sync_at` bump is gated on `outcome.shouldBump`.
   - The haji core returns `partial: outcome.kind === 'partial'`.
   - `hardfail` still throws.
3. **Run:** `node --test tests/*.test.js` — all pass (Node 22 needs the glob, not bare `tests/`).
4. **Post-deploy verification:** `last_jamaah_haji_sync_at` should advance even on partial cycles (no agent stuck >2h from a partial); confirm no Meta CAPI haji Purchase events fire on a cycle that logs `[haji-api/...] partial sync`.

---

## Out of scope (follow-ups)
- **Per-cycle reliability of haji's departure-year fetches** (why a cycle goes partial at all — `getHajiApiDepartureMasehiYears` spans ~17 years). Separate concern; this fix only makes a partial cycle behave correctly.
- Legacy manual haji path (`AWAPI_SYNC_ENABLED=false`) — untouched.

## Expected impact
- HajiPage "last sync" label advances on every completed cycle (no freeze on partial).
- No Meta CAPI haji Purchase events on partial/incomplete data.
- No behavior change on fully-successful cycles (cleanup + CAPI + bump as before).
