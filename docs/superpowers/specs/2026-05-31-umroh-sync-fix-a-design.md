# Fix A — Umroh sync: stop legacy fallback on partial fetch

**Date:** 2026-05-31
**Branch:** `fix/umroh-sync-partial-no-fallback`
**Status:** Approved design, pending implementation plan
**Related memory:** `project_sync_bug_patterns.md` (Pattern 5, Pattern 8)

---

## Problem

Users perceive that umroh jamaah background sync in `/dashboard/jamaah` is "not up to date" and that they must run a **manual sync** before data changes appear. Investigation (live prod DB `Alhijaz.co` + code) found two real backend pathologies, both rooted in the tail of `syncUmrahViaApiCore` (`server.js`):

1. **Frozen "last sync" label.** The UI label reads `agents.last_jamaah_sync_at` (`server.js:8947`). That column is bumped only at `server.js:~6027`, **after** the throw checks. Each agent fetches **6 endpoints/cycle** (3 Hijriah years `1447/1448/1449` × `/bh` + `/dh`). The AWAPI client has **no retry/backoff** (`awapi-client.js:81,86`), so a single transient endpoint failure sets `fetchErrors > 0` → `throw "API fetch incomplete"` (`server.js:5981`) → the bump is never reached → the label freezes.

2. **API↔legacy data flap.** The upsert runs **before** the throw (`server.js:5962-5975` then `5981`). On throw, `syncOneAgent` (`server.js:14644-14649`) falls back to a full **legacy scrape** that rewrites the same rows with staler HTML values (`bayar: item.bayar || 0`, `server.js:14736`). Next cycle the API re-corrects them → endless flap.

### Evidence (prod, server time 2026-05-31 11:13 UTC)

| Metric | Value | Meaning |
|---|---|---|
| `nikita` rows written in last 15 min | **531 / 877** | actively synced every cycle… |
| `nikita` `last_jamaah_sync_at` age | **54 min** | …but bump never happens (throws first) |
| `jamaah` `n_tup_upd` / live row | **1,494×** | severe flap (Pattern 8 was 1,191×) |
| Keyed agents with bump >40 min stale | **9 / 30** | widespread throw-before-bump |
| Agents without `awapi_key` (frozen 18 days) | **5** | separate dead cohort (out of scope) |

The legacy fallback path *does* bump (`server.js:14990`), but only if the legacy scrape completes — which a 877-row slow-PHP scrape for `nikita` rarely does, so both paths fail to bump.

> Pattern 8 (memory) already anticipated the deeper fix: *"hilangkan legacy fallback sepenuhnya saat `AWAPI_SYNC_ENABLED && agent.awapi_key`, atau pastikan legacy tidak pernah me-revert kolom yang sudah ditulis API."* This spec implements that.

---

## Decisions (locked with user)

1. **Legacy only for hard/total failure.** On *partial* fetch (some endpoints failed but ≥1 succeeded), do **not** fall back to legacy — accept the partial API write, retry next cycle. Legacy fallback remains only for total API failure (no usable rows / auth error) and DB upsert failure.
2. **Notif + CAPI only on full success** (`fetchErrors === 0`). Partial cycles write data + bump the label but stay silent (preserves Pattern 8 intent).
3. **Single timestamp column.** Bump `agents.last_jamaah_sync_at` on every cycle that completes its upsert (partial or full). The label means "when sync last ran." No DB migration.
4. **Payment anomaly keeps falling back to legacy** (`server.js:5947`). Rare, deliberate safety guard for negative-sisa rows; unchanged.

---

## Design (Approach A — minimal core-tail change + pure helper)

### Key insight: callers are already correct

Both callers branch on **throw vs return** exactly as needed; their control flow is **not changed**:

- Background `syncOneAgent` (`server.js:14633-14650`): `try { result = core(); set success state; return } catch { legacy }`
- Manual handler `/api/laporan/sync` (`server.js:6276-6283`): `try { return core() } catch { legacy }`

So the fix only changes what the **core** does at its tail: decide `throw` (hard fail → caller does legacy) vs `return` (full/partial → caller is done).

### Component 1 — `lib/awapi-sync-outcome.js` (new, pure)

```js
classifyAwapiSyncOutcome({ fetchErrors, upsertErrors, anyRowsFetched })
  → { kind: 'full' | 'partial' | 'hardfail', shouldNotify, shouldCleanup, shouldBump, reason }
```

Rules, evaluated **in this order** (first match wins — order matters):

| # | Condition | kind | shouldBump | shouldNotify | shouldCleanup |
|---|---|---|---|---|---|
| 1 | `upsertErrors > 0` | `hardfail` | false | false | false |
| 2 | `fetchErrors === 0` | `full` | true | true | true |
| 3 | `!anyRowsFetched` (implies `fetchErrors > 0` here) | `hardfail` | false | false | false |
| 4 | else (`fetchErrors > 0` and some rows) | `partial` | true | false | false |

Order is significant: rule 2 before rule 3 ensures a **clean fetch that legitimately returns 0 rows** (`fetchErrors === 0`, agent has no jamaah that year) is classified `full`, not `hardfail`. Rule 3 only fires when there were fetch errors **and** we got nothing usable.

- `anyRowsFetched` = `rowsByKey.size > 0` (raw normalized rows collected from the fetch loop, before the payment guard).
- `hardfail` returns all flags `false`; they are unused because the core throws on hardfail, but the helper returns them explicitly for test clarity.

Pure function, no I/O — unit-testable in isolation. Mirrors `lib/sync-cleanup.js` / `lib/jamaah-phase2-policy.js`.

### Component 2 — `syncUmrahViaApiCore` tail (`server.js` ~5977-6030)

- Keep the payment-anomaly throw (`5947`) → hard fail → legacy (unchanged).
- Track `anyRowsFetched` (= `rowsByKey.size > 0`); `fetchErrors` and `upsertErrors` already exist.
- Replace the two throws (`upsertErrors>0`, `fetchErrors>0`) with `const outcome = classifyAwapiSyncOutcome({ fetchErrors, upsertErrors, anyRowsFetched })`:
  - `outcome.kind === 'hardfail'` → `throw new Error(outcome.reason)` (caller falls back to legacy — same effect as today for these conditions).
  - otherwise → continue (no throw).
- Wrap `queueJamaahSyncNotifications`, the cleanup block, and `processCapiPurchases` in `if (outcome.shouldNotify)` / `if (outcome.shouldCleanup)` (full only). Note: cleanup is already effectively gated because `listComplete === (fetchErrors === 0)`, but gate it explicitly via the outcome for clarity.
- Bump `agents.last_jamaah_sync_at` whenever `outcome.shouldBump` (partial + full).
- Return `{ ok: outcome.kind === 'full', partial: outcome.kind === 'partial', count, yearsCompleted, yearsAttempted, syncedAt }`.

### Component 3 — callers (cosmetic only)

- **Background** `syncOneAgent`: no control-flow change. Update the success log so a partial cycle isn't labelled "complete" (e.g. include `partial` / `yearsCompleted` in the message).
- **Manual** `syncUmrahViaApi` (`server.js:6213-6225`): no control-flow change. Add `partial` to the response `data` so the frontend can optionally surface "sebagian data tertunda, akan lengkap di sync berikutnya." (Frontend change is optional / follow-up.)

### Data flow

```
fetch 6 endpoints → upsert fetched rows (always)
  ↓
classifyAwapiSyncOutcome(fetchErrors, upsertErrors, totalFetchPlans, anyRowsFetched)
  ├── hardfail → throw ─────────────→ caller catch → legacy scrape (safety net)
  ├── partial  → bump only ─────────→ caller: success, NO legacy, NO notif/CAPI/cleanup
  └── full     → bump + notif + CAPI + cleanup → caller: success
```

### Error handling

- Hard fail (all endpoints down / auth invalid / DB upsert fail / payment anomaly) → `throw` → existing caller `catch` → legacy. Unchanged safety net.
- Unexpected/unknown throw inside the core still propagates to the caller `catch` → legacy (defense in depth; no new swallowing).
- Partial fetch: rows from failed endpoints simply keep their prior DB values this cycle (no revert), refreshed on the next clean cycle.

---

## Testing (`node:test`)

1. **`tests/awapi-sync-outcome.test.js`** — unit-test `classifyAwapiSyncOutcome`:
   - all-success with rows → `full`, all flags true
   - clean fetch (`fetchErrors === 0`) but 0 rows → `full` (not hardfail) — guards the ordering
   - 1 endpoint failed, ≥1 row fetched → `partial`, `shouldBump` true, `shouldNotify`/`shouldCleanup` false
   - fetch errors and no rows fetched → `hardfail`
   - `upsertErrors>0` → `hardfail`
2. **`tests/awapi-partial-no-fallback.test.js`** — source-assertion on `server.js` (mirror `awapi-sync-guard.test.js`):
   - `classifyAwapiSyncOutcome` is imported and called in the core
   - the old `if (fetchErrors > 0) { throw ... 'API fetch incomplete' }` is gone (`assert.doesNotMatch`)
   - `queueJamaahSyncNotifications` and `processCapiPurchases` are gated on the outcome (full)
   - the `last_jamaah_sync_at` bump is reachable without a preceding `fetchErrors` throw
   - the core returns a `partial` field
3. **Run:** `node --test tests/`
4. **Post-deploy manual verification:** re-run the staleness queries — `nikita.last_jamaah_sync_at` should advance each cycle, and `jamaah` `n_tup_upd` growth rate should drop sharply (flap eliminated). Watch logs for `[SYNC/api/bg] <slug> aborted, falling back to legacy` frequency dropping.

---

## Out of scope (follow-ups)

- **5 keyless agents** (`jan-praba`, `selfi`, `isti`, `sari`, `emalisma`) frozen 18 days — credential rot; separate fix (re-discover key / flag in UI).
- **Frontend refetch** (no focus/visibility refetch; 5-min timer suppressed during sync) — separate "Fix C".
- **Phase-2 enrichment deferral** to 01/09/14 WIB — by design; not changed here.
- **401-specific key invalidation** (clear `awapi_key` on auth failure so `ensureAwapiCredentials` re-discovers) — possible enhancement, not required for Fix A.

---

## Expected impact

- "Last sync" label reflects reality (advances every cycle, partial or full).
- API↔legacy flap eliminated for keyed agents → bayar/sisa stop bouncing.
- Large IO reduction: most of the 5.5M `jamaah` updates (Pattern 5/8 flap) should disappear.
- Legacy scrape still protects total-failure and keyless cases.
