# Analytics Retention & Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurangi growth row masif di `analytics_events` & `capi_event_logs` dengan retention 14 hari raw + daily aggregate untuk analytics, tanpa mengubah sisi ingest.

**Architecture:** Tambah tabel `analytics_events_daily` (PK: date × agent × event_type × event_name). Cron harian 02:00 WIB: agregat event D-1 → upsert agg → delete raw > 14 hari. Read-path `/api/analytics/summary` di-refactor untuk merge raw + agg.

**Tech Stack:** Node.js 22, Express 5, Supabase (PostgreSQL 15+), `node --test` (built-in, tanpa dependency baru).

**Reference spec:** [docs/superpowers/specs/2026-04-18-analytics-retention-design.md](../specs/2026-04-18-analytics-retention-design.md)

---

## File Structure

**New files:**
- `lib/analytics-maintenance.js` — pure helpers + DB-integrated aggregation/cleanup/fetch
- `tests/analytics-maintenance.test.js` — unit tests untuk pure helpers (pakai `node:test`)
- `scripts/migrate-analytics-daily.js` — SQL migration helper (pola sama seperti `scripts/migrate-capi-event-logs.js`)
- `scripts/backfill-analytics-daily.js` — one-shot backfill historical data

**Modified:**
- `server.js`:
  - `+` import `runAnalyticsMaintenance`, `fetchEventsForRange` dari `lib/analytics-maintenance.js`
  - `+` `scheduleAnalyticsMaintenanceCron()` + call di startup (near L255)
  - `~` refactor `GET /api/analytics/summary` (L6444–6600an) untuk merge raw + agg
  - `-` remove `capiLogCleanupLast` Map + lazy cleanup block (L2647–2657)
- `docs/project-summary.md` — tambah `analytics_events_daily` ke daftar tabel

---

## Task 1: Database Migration

**Files:**
- Create: `scripts/migrate-analytics-daily.js`

Table migration via Supabase SQL Editor karena proyek ini tidak punya tooling migrasi otomatis — script hanya cetak SQL untuk di-copy.

- [ ] **Step 1: Create migration script**

Create `scripts/migrate-analytics-daily.js`:

```js
/**
 * Migration: Create analytics_events_daily aggregate table + supporting index.
 *
 * Run: node scripts/migrate-analytics-daily.js
 * Then paste SQL output into Supabase SQL Editor.
 */
const SQL = `
-- Aggregate table (daily rollup)
CREATE TABLE IF NOT EXISTS analytics_events_daily (
  date        DATE NOT NULL,
  agent_id    UUID NOT NULL,
  event_type  TEXT NOT NULL,
  event_name  TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, agent_id, event_type, event_name)
);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date
  ON analytics_events_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_agent
  ON analytics_events_daily(agent_id, date DESC);

-- Supporting index on analytics_events.created_at
-- Needed for fast retention DELETE and range queries in /api/analytics/summary.
-- Verify first: SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_events';
CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON analytics_events(created_at DESC);
`;

console.log('Paste the following SQL into Supabase SQL Editor:\n');
console.log(SQL);
console.log('\nThen verify:');
console.log(`  SELECT indexname FROM pg_indexes WHERE tablename IN ('analytics_events', 'analytics_events_daily');`);
```

- [ ] **Step 2: Run script to print SQL**

Run: `node scripts/migrate-analytics-daily.js`
Expected: SQL block printed to stdout.

- [ ] **Step 3: Execute SQL in Supabase SQL Editor**

Paste output ke Supabase Dashboard → SQL Editor → Run.

- [ ] **Step 4: Verify in Supabase**

Run in Supabase SQL Editor:
```sql
SELECT indexname FROM pg_indexes
WHERE tablename IN ('analytics_events', 'analytics_events_daily')
ORDER BY tablename, indexname;
```

Expected output includes:
- `idx_analytics_daily_agent`
- `idx_analytics_daily_date`
- `idx_analytics_events_created`
- `analytics_events_daily_pkey`

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-analytics-daily.js
git commit -m "feat(db): add analytics_events_daily aggregate table migration"
```

---

## Task 2: Pure Helpers with Tests (TDD)

**Files:**
- Create: `lib/analytics-maintenance.js`
- Create: `tests/analytics-maintenance.test.js`

Pure helpers: tidak menyentuh DB, bisa di-unit-test tanpa mock.

- [ ] **Step 1: Write failing tests**

Create `tests/analytics-maintenance.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANON_AGENT,
  buildCountMap,
  countMapToRows,
  computeRangeSplit,
  countMatches,
  tallyBy,
} from '../lib/analytics-maintenance.js';

test('buildCountMap: groups by (agent_id|event_type|event_name) and coalesces null agent_id to sentinel', () => {
  const rows = [
    { agent_id: 'a1', event_type: 'action', event_name: 'sync_jamaah' },
    { agent_id: 'a1', event_type: 'action', event_name: 'sync_jamaah' },
    { agent_id: 'a2', event_type: 'login', event_name: 'login' },
    { agent_id: null, event_type: 'login', event_name: 'login_failed' },
    { agent_id: null, event_type: 'login', event_name: 'login_failed' },
  ];
  const m = buildCountMap(rows);
  assert.equal(m.get('a1|action|sync_jamaah'), 2);
  assert.equal(m.get('a2|login|login'), 1);
  assert.equal(m.get(`${ANON_AGENT}|login|login_failed`), 2);
});

test('countMapToRows: builds upsert rows with the given dateKey', () => {
  const m = new Map([
    ['a1|action|sync_jamaah', 2],
    ['a2|login|login', 1],
  ]);
  const rows = countMapToRows(m, '2026-04-10');
  assert.equal(rows.length, 2);
  const byKey = Object.fromEntries(rows.map(r => [`${r.agent_id}|${r.event_type}|${r.event_name}`, r]));
  assert.deepEqual(
    { date: byKey['a1|action|sync_jamaah'].date, count: byKey['a1|action|sync_jamaah'].count },
    { date: '2026-04-10', count: 2 }
  );
  assert.equal(byKey['a2|login|login'].count, 1);
  assert.ok(byKey['a1|action|sync_jamaah'].updated_at);
});

test('computeRangeSplit: month before cutoff → pure agg, no raw', () => {
  // now = 2026-04-18, cutoff = 2026-04-04
  const now = new Date('2026-04-18T00:00:00Z').getTime();
  const split = computeRangeSplit(
    '2026-02-01T00:00:00.000Z',
    '2026-02-28T23:59:59.999Z',
    now,
  );
  assert.equal(split.useRaw, false);
  assert.equal(split.useAgg, true);
  assert.equal(split.aggStartDate, '2026-02-01');
  assert.equal(split.aggEndDate, '2026-02-28');
});

test('computeRangeSplit: month entirely within cutoff → pure raw, no agg', () => {
  const now = new Date('2026-04-18T00:00:00Z').getTime();
  // last 10 days — entirely within 14d cutoff
  const split = computeRangeSplit(
    '2026-04-08T00:00:00.000Z',
    '2026-04-18T00:00:00.000Z',
    now,
  );
  assert.equal(split.useRaw, true);
  assert.equal(split.useAgg, false);
});

test('computeRangeSplit: month straddles cutoff → both raw + agg, non-overlapping', () => {
  const now = new Date('2026-04-18T00:00:00Z').getTime();
  // cutoff = 2026-04-04T00:00:00Z
  const split = computeRangeSplit(
    '2026-04-01T00:00:00.000Z',
    '2026-04-30T23:59:59.999Z',
    now,
  );
  assert.equal(split.useRaw, true);
  assert.equal(split.useAgg, true);
  assert.equal(split.aggStartDate, '2026-04-01');
  assert.equal(split.aggEndDate, '2026-04-03'); // day before cutoff date
  assert.equal(split.rawStartISO, '2026-04-04T00:00:00.000Z');
});

test('countMatches: sums raw.length(matching) + agg.count(matching)', () => {
  const raw = [
    { event_name: 'login' },
    { event_name: 'page_view' },
    { event_name: 'login' },
  ];
  const agg = [
    { event_name: 'login', count: 5 },
    { event_name: 'login', count: 3 },
    { event_name: 'page_view', count: 100 },
  ];
  assert.equal(countMatches(raw, agg, e => e.event_name === 'login'), 2 + 5 + 3);
  assert.equal(countMatches(raw, agg, e => e.event_name === 'page_view'), 1 + 100);
});

test('tallyBy: sums per key across raw + agg', () => {
  const raw = [
    { event_type: 'feature', event_name: 'open_jamaah' },
    { event_type: 'feature', event_name: 'open_jamaah' },
    { event_type: 'feature', event_name: 'open_compare' },
    { event_type: 'action',  event_name: 'sync_jamaah' }, // filtered out
  ];
  const agg = [
    { event_type: 'feature', event_name: 'open_jamaah', count: 10 },
    { event_type: 'feature', event_name: 'open_analytics', count: 4 },
  ];
  const m = tallyBy(raw, agg, r => r.event_name, r => r.event_type === 'feature');
  assert.equal(m['open_jamaah'], 2 + 10);
  assert.equal(m['open_compare'], 1);
  assert.equal(m['open_analytics'], 4);
  assert.equal(m['sync_jamaah'], undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/analytics-maintenance.test.js`
Expected: FAIL with `Cannot find module '../lib/analytics-maintenance.js'`.

- [ ] **Step 3: Implement helpers**

Create `lib/analytics-maintenance.js`:

```js
export const ANON_AGENT = '00000000-0000-0000-0000-000000000000';
export const RAW_RETENTION_DAYS = 14;

// ── Pure helpers ──────────────────────────────────────────────────────

export function buildCountMap(rows) {
  const m = new Map();
  for (const row of rows) {
    const aid = row.agent_id || ANON_AGENT;
    const key = `${aid}|${row.event_type}|${row.event_name}`;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}

export function countMapToRows(countMap, dateKey) {
  const now = new Date().toISOString();
  const rows = [];
  for (const [key, count] of countMap.entries()) {
    const [agent_id, event_type, event_name] = key.split('|');
    rows.push({ date: dateKey, agent_id, event_type, event_name, count, updated_at: now });
  }
  return rows;
}

/**
 * Given a request range [startISO, endISO] and "now", decide which sub-ranges
 * to read from raw vs aggregate. Cutoff = now - 14 days (midnight UTC of that day).
 *
 * Returns:
 *   useRaw:       whether to query analytics_events
 *   rawStartISO:  lower bound for raw query (inclusive)
 *   rawEndISO:    upper bound for raw query (inclusive)
 *   useAgg:       whether to query analytics_events_daily
 *   aggStartDate: 'YYYY-MM-DD' lower bound for agg (inclusive)
 *   aggEndDate:   'YYYY-MM-DD' upper bound for agg (inclusive) — day BEFORE cutoff date
 */
export function computeRangeSplit(startISO, endISO, nowMs) {
  const cutoffMs = nowMs - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  // Normalize cutoff to start of its UTC day (makes "cutoff date" deterministic)
  const cutoffDate = new Date(cutoffMs);
  cutoffDate.setUTCHours(0, 0, 0, 0);
  const cutoffMidnightMs = cutoffDate.getTime();

  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();

  const useRaw = endMs >= cutoffMidnightMs;
  const useAgg = startMs < cutoffMidnightMs;

  const result = { useRaw, useAgg };

  if (useRaw) {
    result.rawStartISO = new Date(Math.max(startMs, cutoffMidnightMs)).toISOString();
    result.rawEndISO = new Date(endMs).toISOString();
  }

  if (useAgg) {
    // Agg covers up to the day BEFORE cutoff (cutoff day itself is raw territory).
    const aggEndMs = Math.min(endMs, cutoffMidnightMs - 1);
    result.aggStartDate = new Date(startMs).toISOString().slice(0, 10);
    result.aggEndDate = new Date(aggEndMs).toISOString().slice(0, 10);
  }

  return result;
}

export function countMatches(rawEvents, aggEvents, predicate) {
  let n = 0;
  for (const e of rawEvents) if (predicate(e)) n++;
  for (const a of aggEvents) if (predicate(a)) n += a.count;
  return n;
}

export function tallyBy(rawEvents, aggEvents, keyFn, predicate) {
  const map = {};
  for (const e of rawEvents) {
    if (predicate && !predicate(e)) continue;
    const k = keyFn(e);
    map[k] = (map[k] || 0) + 1;
  }
  for (const a of aggEvents) {
    if (predicate && !predicate(a)) continue;
    const k = keyFn(a);
    map[k] = (map[k] || 0) + a.count;
  }
  return map;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/analytics-maintenance.test.js`
Expected: `# pass 7`, all green.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics-maintenance.js tests/analytics-maintenance.test.js
git commit -m "feat(analytics): add pure helpers for retention + aggregation with tests"
```

---

## Task 3: DB-Integrated Aggregation & Maintenance Functions

**Files:**
- Modify: `lib/analytics-maintenance.js`

Functions yang bersentuhan dengan Supabase. Diuji via verification di Task 7 (manual backfill + first cron run), bukan unit test — karena butuh real DB connection dan proyek belum punya test DB setup.

- [ ] **Step 1: Add DB functions to `lib/analytics-maintenance.js`**

Append to `lib/analytics-maintenance.js` (at the bottom, after pure helpers):

```js
// ── DB-integrated functions ───────────────────────────────────────────

const AGGREGATE_FETCH_BATCH = 1000;
const AGGREGATE_UPSERT_CHUNK = 500;

/**
 * Aggregate all analytics_events rows within [startISO, endISO) into
 * analytics_events_daily. Upsert on PK — idempotent.
 *
 * @param {SupabaseClient} supabase
 * @param {string} startISO - inclusive lower bound, e.g. '2026-04-17T00:00:00.000Z'
 * @param {string} endISO   - exclusive upper bound, e.g. '2026-04-18T00:00:00.000Z'
 * @returns {Promise<{scanned: number, upserted: number}>}
 */
export async function aggregateAnalyticsDay(supabase, startISO, endISO) {
  const dateKey = startISO.slice(0, 10);
  const counts = new Map();
  let scanned = 0;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('agent_id, event_type, event_name')
      .gte('created_at', startISO)
      .lt('created_at', endISO)
      .range(offset, offset + AGGREGATE_FETCH_BATCH - 1);
    if (error) throw new Error(`aggregateAnalyticsDay fetch error: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;
    const pageMap = buildCountMap(data);
    for (const [k, v] of pageMap.entries()) counts.set(k, (counts.get(k) || 0) + v);

    if (data.length < AGGREGATE_FETCH_BATCH) break;
    offset += AGGREGATE_FETCH_BATCH;
  }

  if (counts.size === 0) return { scanned, upserted: 0 };

  const rows = countMapToRows(counts, dateKey);
  let upserted = 0;
  for (let i = 0; i < rows.length; i += AGGREGATE_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + AGGREGATE_UPSERT_CHUNK);
    const { error } = await supabase
      .from('analytics_events_daily')
      .upsert(chunk, { onConflict: 'date,agent_id,event_type,event_name' });
    if (error) throw new Error(`aggregateAnalyticsDay upsert error: ${error.message}`);
    upserted += chunk.length;
  }
  return { scanned, upserted };
}

/**
 * Full maintenance cycle: aggregate yesterday (UTC day), then delete raw > 14d.
 * Skips cleanup if aggregation fails to avoid data loss.
 */
export async function runAnalyticsMaintenance(supabase) {
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);

  let aggResult;
  try {
    aggResult = await aggregateAnalyticsDay(
      supabase,
      yesterdayStart.toISOString(),
      yesterdayEnd.toISOString(),
    );
    console.log(`[Analytics] Aggregated ${aggResult.scanned} events into ${aggResult.upserted} daily rows for ${yesterdayStart.toISOString().slice(0,10)}`);
  } catch (err) {
    console.error('[Analytics] Aggregation failed, skipping cleanup:', err.message);
    return { aggregated: false };
  }

  const cutoff = new Date(now.getTime() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: e1, count: analyticsDeleted } = await supabase
    .from('analytics_events')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (e1) console.error('[Analytics] Raw cleanup error:', e1.message);
  else console.log(`[Analytics] Deleted ${analyticsDeleted ?? '?'} raw analytics_events rows older than ${cutoff}`);

  const { error: e2, count: capiDeleted } = await supabase
    .from('capi_event_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (e2) console.error('[CAPI] Raw cleanup error:', e2.message);
  else console.log(`[CAPI] Deleted ${capiDeleted ?? '?'} raw capi_event_logs rows older than ${cutoff}`);

  return { aggregated: true, ...aggResult };
}

/**
 * Fetch events for a time range, splitting between raw (analytics_events)
 * and aggregate (analytics_events_daily) based on 14d cutoff.
 *
 * @returns {Promise<{rawEvents: Array, aggEvents: Array}>}
 */
export async function fetchEventsForRange(supabase, startISO, endISO) {
  const split = computeRangeSplit(startISO, endISO, Date.now());
  let rawEvents = [];
  let aggEvents = [];

  if (split.useRaw) {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('agent_id, event_type, event_name, metadata, created_at')
      .gte('created_at', split.rawStartISO)
      .lte('created_at', split.rawEndISO);
    if (error) throw new Error(`fetchEventsForRange raw error: ${error.message}`);
    rawEvents = data || [];
  }

  if (split.useAgg) {
    const { data, error } = await supabase
      .from('analytics_events_daily')
      .select('date, agent_id, event_type, event_name, count')
      .gte('date', split.aggStartDate)
      .lte('date', split.aggEndDate);
    if (error) throw new Error(`fetchEventsForRange agg error: ${error.message}`);
    aggEvents = data || [];
  }

  return { rawEvents, aggEvents };
}
```

- [ ] **Step 2: Re-run existing tests to make sure nothing broke**

Run: `node --test tests/analytics-maintenance.test.js`
Expected: `# pass 7`, all green (new code is added alongside, doesn't affect pure helpers).

- [ ] **Step 3: Commit**

```bash
git add lib/analytics-maintenance.js
git commit -m "feat(analytics): add DB-integrated aggregate + cleanup + fetchEventsForRange"
```

---

## Task 4: Wire Cron Into server.js Startup

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add import near top of server.js**

Find the top of `server.js` where other imports live (around the top, before `app.use(express.json...)` at L55). Add:

```js
import {
  runAnalyticsMaintenance,
  fetchEventsForRange,
  countMatches,
  tallyBy,
  RAW_RETENTION_DAYS,
} from './lib/analytics-maintenance.js';
```

(`countMatches` + `tallyBy` tidak dipakai di Task 4 ini, tapi akan dipakai di Task 5 — ditaruh di import block yang sama supaya tidak perlu edit import ulang nanti.)

- [ ] **Step 2: Add scheduleAnalyticsMaintenanceCron function**

Find [`scheduleKursCron` at server.js:221](../../../server.js#L221). Directly after the `scheduleKursCron()` call at [L255](../../../server.js#L255), insert:

```js
function scheduleAnalyticsMaintenanceCron() {
  const now = new Date();
  // 02:00 WIB = 19:00 UTC previous day
  const next = new Date(now);
  next.setUTCHours(19, 0, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const msUntil = next - now;
  const wibHour = (next.getUTCHours() + 7) % 24;
  const wibMin = String(next.getUTCMinutes()).padStart(2, '0');
  console.log(`[Analytics] Next maintenance run in ${Math.round(msUntil / 60000)} minutes (${wibHour}:${wibMin} WIB)`);
  setTimeout(async () => {
    try {
      await runAnalyticsMaintenance(supabase);
    } catch (err) {
      console.error('[Analytics] Maintenance run threw:', err.message);
    }
    scheduleAnalyticsMaintenanceCron();
  }, msUntil);
}

scheduleAnalyticsMaintenanceCron();
```

- [ ] **Step 3: Start server and verify log line**

Run: `npm start` (or restart server)
Expected stdout includes: `[Analytics] Next maintenance run in N minutes (02:00 WIB)`

Stop the server (Ctrl+C) after verifying the log line.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(analytics): schedule daily maintenance cron at 02:00 WIB"
```

---

## Task 5: Refactor /api/analytics/summary Read-Path

**Files:**
- Modify: `server.js` (lines ~6444–6600)

Mengganti `monthEvents` query tunggal → merged raw + agg via `fetchEventsForRange`. Semua tally yang saat ini pakai `.filter(...).length` → ganti ke `countMatches` / `tallyBy`.

- [ ] **Step 1: Replace monthEvents fetch**

Di [server.js:6458-6466](../../../server.js#L6458-L6466), ganti:

```js
    // Fetch all events for the month
    const { data: monthEvents } = await supabase
      .from('analytics_events')
      .select('*')
      .gte('created_at', startOfMonth)
      .lte('created_at', endOfMonth)
      .order('created_at', { ascending: false });

    const events = monthEvents || [];
```

Menjadi:

```js
    // Fetch events for the month, split between raw (<=14d) and agg (>14d).
    const { rawEvents, aggEvents } = await fetchEventsForRange(supabase, startOfMonth, endOfMonth);
    // Sort raw DESC by created_at (agg has no timestamp granularity beyond date)
    rawEvents.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
```

- [ ] **Step 2: Verify imports from Task 4 are present**

`countMatches` and `tallyBy` should already be imported at the top of `server.js` from Task 4 Step 1. Sanity-check:

```bash
grep -n "countMatches" /Users/bagas/alhijaz/server.js
```
Expected: at least one match on the import block (line near top). If missing, add `countMatches, tallyBy,` to the existing `import { ... } from './lib/analytics-maintenance.js';` block.

- [ ] **Step 3: Refactor Overview block**

Replace [server.js:6468-6471](../../../server.js#L6468-L6471):

```js
    // Overview
    const totalLogins = events.filter(e => e.event_name === 'login').length;
    const totalPageViews = events.filter(e => e.event_name === 'page_view').length;
    const totalWAClicks = events.filter(e => ['wa_click_public', 'wa_click_jamaah'].includes(e.event_name)).length;
```

With:

```js
    // Overview — counts sum across raw + agg
    const totalLogins = countMatches(rawEvents, aggEvents, e => e.event_name === 'login');
    const totalPageViews = countMatches(rawEvents, aggEvents, e => e.event_name === 'page_view');
    const totalWAClicks = countMatches(
      rawEvents, aggEvents,
      e => e.event_name === 'wa_click_public' || e.event_name === 'wa_click_jamaah',
    );
```

- [ ] **Step 4: Refactor Active Agents (7d) — raw-only**

Active agents window is 7 days, always within 14d cutoff → use `rawEvents` only. Replace [server.js:6473-6479](../../../server.js#L6473-L6479):

```js
    // Active agents (any event in last 7 days)
    const { data: allAgents } = await supabase.from('agents').select('id, slug, name, photo');
    const agentList = allAgents || [];
    const recentIds = new Set(
      events.filter(e => new Date(e.created_at) >= new Date(now7d)).map(e => e.agent_id)
    );
    const activeAgents = recentIds.size;
```

With:

```js
    // Active agents (any event in last 7 days). 7d ⊂ 14d, so raw is sufficient.
    const { data: allAgents } = await supabase.from('agents').select('id, slug, name, photo');
    const agentList = allAgents || [];
    const recentIds = new Set(
      rawEvents.filter(e => new Date(e.created_at) >= new Date(now7d)).map(e => e.agent_id)
    );
    const activeAgents = recentIds.size;
```

- [ ] **Step 5: Refactor Daily Logins (last 7 days) — raw-only**

Replace [server.js:6481-6492](../../../server.js#L6481-L6492):

```js
    // Daily logins (last 7 days)
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const dailyLogins = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = events.filter(e =>
        e.event_name === 'login' && e.created_at.slice(0, 10) === dateStr
      ).length;
      dailyLogins.push({ date: dateStr, day: dayNames[d.getDay()], count });
    }
```

With (same logic, just use `rawEvents`):

```js
    // Daily logins (last 7 days). Within retention window, use raw.
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const dailyLogins = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = rawEvents.filter(e =>
        e.event_name === 'login' && e.created_at.slice(0, 10) === dateStr
      ).length;
      dailyLogins.push({ date: dateStr, day: dayNames[d.getDay()], count });
    }
```

- [ ] **Step 6: Refactor Agent Activity (per-agent month counts)**

Replace [server.js:6494-6518](../../../server.js#L6494-L6518):

```js
    // Agent Activity
    const agentActivity = agentList.map(agent => {
      const agentEvents = events.filter(e => e.agent_id === agent.id);
      const logins = agentEvents.filter(e => e.event_name === 'login').length;
      const featureClicks = agentEvents.filter(e => e.event_type === 'feature').length;
      const pageViews = agentEvents.filter(e => e.event_name === 'page_view').length;
      const waClicks = agentEvents.filter(e => ['wa_click_public', 'wa_click_jamaah'].includes(e.event_name)).length;
      const lastEvent = agentEvents[0];
      const lastActive = lastEvent?.created_at || null;

      let status = 'never';
      if (lastActive) {
        if (new Date(lastActive) >= new Date(now3d)) status = 'active';
        else if (new Date(lastActive) >= new Date(now7d)) status = 'inactive';
        else if (new Date(lastActive) >= new Date(now30d)) status = 'dormant';
      }

      return {
        slug: agent.slug, name: agent.name, photo: agent.photo,
        lastActive, logins, featureClicks, pageViews, waClicks, status,
      };
    });
    // Sort: active first, then by logins DESC
    const statusOrder = { active: 0, inactive: 1, dormant: 2, never: 3 };
    agentActivity.sort((a, b) => (statusOrder[a.status] - statusOrder[b.status]) || (b.logins - a.logins));
```

With:

```js
    // Agent Activity. Per-agent metrics merge raw + agg.
    // lastActive: prefer raw timestamp (precise); fallback to agg max date (day-granular).
    const agentActivity = agentList.map(agent => {
      const rawForAgent = rawEvents.filter(e => e.agent_id === agent.id);
      const aggForAgent = aggEvents.filter(a => a.agent_id === agent.id);

      const logins = countMatches(rawForAgent, aggForAgent, e => e.event_name === 'login');
      const featureClicks = countMatches(rawForAgent, aggForAgent, e => e.event_type === 'feature');
      const pageViews = countMatches(rawForAgent, aggForAgent, e => e.event_name === 'page_view');
      const waClicks = countMatches(
        rawForAgent, aggForAgent,
        e => e.event_name === 'wa_click_public' || e.event_name === 'wa_click_jamaah',
      );

      // lastActive: raw events are DESC-sorted, so [0] is the newest.
      const rawLast = rawForAgent[0]?.created_at || null;
      const aggMaxDate = aggForAgent.reduce((m, a) => (!m || a.date > m ? a.date : m), null);
      // Normalize agg date to end-of-day ISO for comparison
      const aggLast = aggMaxDate ? `${aggMaxDate}T23:59:59.999Z` : null;
      const lastActive = rawLast && aggLast
        ? (rawLast > aggLast ? rawLast : aggLast)
        : (rawLast || aggLast);

      let status = 'never';
      if (lastActive) {
        if (new Date(lastActive) >= new Date(now3d)) status = 'active';
        else if (new Date(lastActive) >= new Date(now7d)) status = 'inactive';
        else if (new Date(lastActive) >= new Date(now30d)) status = 'dormant';
      }

      return {
        slug: agent.slug, name: agent.name, photo: agent.photo,
        lastActive, logins, featureClicks, pageViews, waClicks, status,
      };
    });
    // Sort: active first, then by logins DESC
    const statusOrder = { active: 0, inactive: 1, dormant: 2, never: 3 };
    agentActivity.sort((a, b) => (statusOrder[a.status] - statusOrder[b.status]) || (b.logins - a.logins));
```

- [ ] **Step 7: Refactor Feature Usage**

Replace [server.js:6520-6535](../../../server.js#L6520-L6535):

```js
    // Feature Usage
    const featureEvents = events.filter(e => e.event_type === 'feature');
    const featureMap = {};
    const featureLabels = { /* ... unchanged ... */ };
    featureEvents.forEach(e => { featureMap[e.event_name] = (featureMap[e.event_name] || 0) + 1; });
    const featureUsage = Object.entries(featureMap)
      .map(([feature, count]) => ({ feature, label: featureLabels[feature] || feature, count }))
      .sort((a, b) => b.count - a.count);
```

With:

```js
    // Feature Usage — merge raw + agg via tallyBy
    const featureLabels = {
      open_jamaah: 'Jamaah', open_statistik: 'Statistik', open_kalkulasi: 'Kalkulasi',
      open_compare: 'Compare', open_capi: 'Meta CAPI', open_profil: 'Profil',
      open_jadwal: 'Jadwal', open_analytics: 'Analytics',
      open_ai_tools: 'AI Tools', open_voice_over: 'Voice Over', open_business_card: 'Kartu Nama',
      open_haji_plus: 'Haji Plus', open_jamaah_haji: 'Jamaah Haji',
      open_settings: 'Settings', open_tren_daftar: 'Tren Daftar',
      open_kurs: 'Kurs',
    };
    const featureMap = tallyBy(rawEvents, aggEvents, e => e.event_name, e => e.event_type === 'feature');
    const featureUsage = Object.entries(featureMap)
      .map(([feature, count]) => ({ feature, label: featureLabels[feature] || feature, count }))
      .sort((a, b) => b.count - a.count);
```

- [ ] **Step 8: Refactor Action Tracking**

Replace [server.js:6537-6562](../../../server.js#L6537-L6562):

```js
    // Action Tracking
    const actionEvents = events.filter(e => e.event_type === 'action');
    const actionMap = {};
    const actionLabels = { /* ... */ };
    actionEvents.forEach(e => { actionMap[e.event_name] = (actionMap[e.event_name] || 0) + 1; });
    const actionTracking = Object.entries(actionMap)
      .map(([action, count]) => ({ action, label: actionLabels[action] || action, count }))
      .sort((a, b) => b.count - a.count);
```

With:

```js
    // Action Tracking — merge raw + agg via tallyBy
    const actionLabels = {
      sync_jamaah: 'Sync Jamaah', generate_pdf: 'Generate PDF Quotation',
      share_screenshot: 'Share Screenshot', download_brosur: 'Download Brosur',
      download_itinerary: 'Download Itinerary', wa_click_jamaah: 'WA Click Jamaah',
      save_capi_config: 'Simpan Config CAPI', update_profil: 'Update Profil',
      change_password: 'Ganti Password',
      generate_script: 'Generate Script VO', generate_voice: 'Generate Voice VO',
      download_mp3: 'Download MP3', download_wav: 'Download WAV',
      generate_business_card: 'Generate Kartu Nama', download_business_card: 'Download Kartu Nama',
      export_haji_infographic: 'Export Infografis Haji',
      update_lead_status: 'Update Status Lead', delete_lead: 'Hapus Lead', wa_click_lead: 'WA Lead',
      sync_jamaah_haji: 'Sync Jamaah Haji', view_bpih_doc: 'Lihat BPIH',
      view_pernyataan_doc: 'Lihat Srt Pernyataan', wa_click_haji: 'WA Jamaah Haji',
      connect_telegram: 'Hubungkan Telegram', disconnect_telegram: 'Putuskan Telegram',
      update_notif_prefs: 'Update Notif Prefs',
      forgot_password: 'Lupa Password', reset_password: 'Reset Password',
      view_web_itinerary: 'Web Itinerary', view_flight_status: 'Flight Status',
      share_flight: 'Share Flight Status',
    };
    const actionMap = tallyBy(rawEvents, aggEvents, e => e.event_name, e => e.event_type === 'action');
    const actionTracking = Object.entries(actionMap)
      .map(([action, count]) => ({ action, label: actionLabels[action] || action, count }))
      .sort((a, b) => b.count - a.count);
```

- [ ] **Step 9: Refactor Recent Activity (raw-only, today)**

Replace [server.js:6564-6582](../../../server.js#L6564-L6582):

```js
    // Recent Activity (today, exclude page_view, max 10)
    const todayStr = now.toISOString().slice(0, 10);
    const agentNameMap = Object.fromEntries(agentList.map(a => [a.id, a.name]));
    const agentSlugMap = Object.fromEntries(agentList.map(a => [a.id, a.slug]));
    const allLabels = { /* ... */ };
    const recentActivity = events
      .filter(e => e.created_at.slice(0, 10) === todayStr && e.event_name !== 'page_view')
      .slice(0, 10)
      .map(e => ({ /* ... */ }));
```

With (swap `events` → `rawEvents`):

```js
    // Recent Activity (today, exclude page_view, max 10). Today is always in raw.
    const todayStr = now.toISOString().slice(0, 10);
    const agentNameMap = Object.fromEntries(agentList.map(a => [a.id, a.name]));
    const agentSlugMap = Object.fromEntries(agentList.map(a => [a.id, a.slug]));
    const allLabels = {
      ...featureLabels, ...actionLabels, login: 'Login', login_failed: 'Login Gagal',
      quiz_started: 'Quiz Dimulai', quiz_completed: 'Quiz Selesai', inquiry_submitted: 'Inquiry Masuk',
      page_view: 'Page View', wa_click_public: 'WA Click Public',
    };
    const recentActivity = rawEvents
      .filter(e => e.created_at.slice(0, 10) === todayStr && e.event_name !== 'page_view')
      .slice(0, 10)
      .map(e => ({
        agentSlug: agentSlugMap[e.agent_id] || e.agent_id,
        agentName: agentNameMap[e.agent_id] || e.agent_id,
        eventName: e.event_name,
        label: allLabels[e.event_name] || e.event_name,
        createdAt: e.created_at,
      }));
```

- [ ] **Step 10: Start server and hit endpoint with current month**

Run: `npm start`
In another terminal:
```bash
curl -s -H "Authorization: Bearer <admin-jwt>" \
  "http://localhost:3000/api/analytics/summary?month=$(date +%-m)&year=$(date +%Y)" | jq '.data.overview'
```
Expected: JSON with `totalLogins`, `activeAgents`, `totalAgents`, `totalPageViews`, `totalWAClicks`. Numbers should be non-zero (current month data still in raw).

- [ ] **Step 11: Hit endpoint with an old month (before backfill)**

Run same curl with `month=1&year=2026`. Expected: `totalLogins: 0`, etc. — because `analytics_events_daily` is empty until backfill (Task 7). This is expected at this stage. Stop server (Ctrl+C).

- [ ] **Step 12: Commit**

```bash
git add server.js
git commit -m "refactor(analytics): split summary read-path between raw + aggregate"
```

---

## Task 6: Remove Lazy Cleanup in CAPI Logs Endpoint

**Files:**
- Modify: `server.js` (lines 2622–2665)

- [ ] **Step 1: Remove the `capiLogCleanupLast` Map declaration**

At [server.js:2623](../../../server.js#L2623), delete the line:

```js
const capiLogCleanupLast = new Map(); // agentId -> timestamp
```

- [ ] **Step 2: Remove the lazy cleanup block inside the endpoint**

At [server.js:2646-2657](../../../server.js#L2646-L2657), delete the block:

```js
  // Async cleanup: delete logs older than 30 days (throttled to once/hour per agent)
  const now = Date.now();
  if (!capiLogCleanupLast.has(agent.id) || now - capiLogCleanupLast.get(agent.id) > 3600000) {
    capiLogCleanupLast.set(agent.id, now);
    supabase.from('capi_event_logs')
      .delete()
      .eq('agent_id', agent.id)
      .lt('created_at', new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString())
      .then(({ error: cleanErr }) => {
        if (cleanErr) console.error('[CAPI] Log cleanup error:', cleanErr.message);
      });
  }
```

The endpoint after removal should look like:

```js
app.get('/api/capi/:slug/logs', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgentBySlug(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const eventFilter = req.query.event || null;

  let query = supabase
    .from('capi_event_logs')
    .select('id, event_name, status, value, error_message, source, created_at', { count: 'exact' })
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventFilter) query = query.eq('event_name', eventFilter);

  const { data: logs, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    logs: logs || [],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
});
```

- [ ] **Step 3: Search for any stale references**

Run: grep for `capiLogCleanupLast` across the repo to catch stragglers.

```bash
grep -rn "capiLogCleanupLast" /Users/bagas/alhijaz --exclude-dir=node_modules
```
Expected: no matches (0 lines).

- [ ] **Step 4: Start server and hit the endpoint once**

Run: `npm start`, then:
```bash
curl -s -H "Authorization: Bearer <agent-jwt>" \
  "http://localhost:3000/api/capi/<some-agent-slug>/logs?page=1&limit=5"
```
Expected: JSON with `logs`, `total`, `page`, `totalPages` — no server errors in console. Stop server.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "refactor(capi): remove lazy cleanup on logs endpoint (handled by cron now)"
```

---

## Task 7: Backfill Script

**Files:**
- Create: `scripts/backfill-analytics-daily.js`

One-shot script. Loop per-hari dari tanggal tertua di `analytics_events` sampai `today - 14 days`, panggil `aggregateAnalyticsDay` untuk masing-masing.

- [ ] **Step 1: Create backfill script**

Create `scripts/backfill-analytics-daily.js`:

```js
/**
 * One-shot backfill: populate analytics_events_daily from historical
 * analytics_events rows, up to (today - 14 days).
 *
 * Run: node scripts/backfill-analytics-daily.js
 * Safe to re-run — aggregateAnalyticsDay is idempotent via upsert on PK.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { aggregateAnalyticsDay, RAW_RETENTION_DAYS } from '../lib/analytics-maintenance.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  console.log('[Backfill] Fetching oldest analytics_events row...');
  const { data: oldest, error: oldErr } = await supabase
    .from('analytics_events')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (oldErr || !oldest) {
    console.error('[Backfill] No events found or error:', oldErr?.message);
    return;
  }

  const firstDay = new Date(oldest.created_at);
  firstDay.setUTCHours(0, 0, 0, 0);
  const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  cutoff.setUTCHours(0, 0, 0, 0);

  console.log(`[Backfill] Date range: ${firstDay.toISOString().slice(0,10)} → ${cutoff.toISOString().slice(0,10)} (exclusive)`);

  let cursor = new Date(firstDay);
  let totalScanned = 0;
  let totalUpserted = 0;
  let dayCount = 0;

  while (cursor < cutoff) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    try {
      const { scanned, upserted } = await aggregateAnalyticsDay(
        supabase,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      );
      totalScanned += scanned;
      totalUpserted += upserted;
      dayCount++;
      if (scanned > 0) {
        console.log(`[Backfill] ${dayStart.toISOString().slice(0,10)}: scanned=${scanned}, upserted=${upserted}`);
      }
    } catch (err) {
      console.error(`[Backfill] Failed for ${dayStart.toISOString().slice(0,10)}:`, err.message);
      // Continue with next day instead of aborting — safe because agg is idempotent.
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  console.log(`[Backfill] Done. ${dayCount} days processed, ${totalScanned} events scanned, ${totalUpserted} daily rows upserted.`);
}

main().catch(err => {
  console.error('[Backfill] Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run backfill in production environment**

⚠️ **Production operation — confirm with user before running.** This reads from `analytics_events` and writes to `analytics_events_daily`. It is idempotent (safe to re-run) but can take minutes for large datasets.

Run: `node scripts/backfill-analytics-daily.js`

Expected output pattern:
```
[Backfill] Fetching oldest analytics_events row...
[Backfill] Date range: 2026-01-01 → 2026-04-04 (exclusive)
[Backfill] 2026-01-01: scanned=123, upserted=18
[Backfill] 2026-01-02: scanned=145, upserted=22
...
[Backfill] Done. 93 days processed, 12345 events scanned, 678 daily rows upserted.
```

- [ ] **Step 3: Verify aggregate table populated**

In Supabase SQL Editor:
```sql
SELECT COUNT(*) AS total_rows,
       MIN(date) AS earliest_date,
       MAX(date) AS latest_date
FROM analytics_events_daily;
```

Expected: non-zero `total_rows`, `earliest_date` ≈ oldest `analytics_events.created_at`, `latest_date` = today - 15 days (i.e. one day before the cutoff).

- [ ] **Step 4: Spot-check one agent's counts match between raw and agg**

Pick a date within the backfill window (e.g. last week that was already > 14 days old, or verify on one with both raw and agg — use overlap day if needed). In SQL Editor:

```sql
-- Pick a date still in raw (e.g. the boundary)
WITH d AS (SELECT (CURRENT_DATE - INTERVAL '15 days')::date AS dt)
SELECT a.agent_id, a.event_type, a.event_name, COUNT(*) AS raw_count, g.count AS agg_count
FROM analytics_events a
JOIN d ON true
LEFT JOIN analytics_events_daily g
  ON g.date = d.dt AND g.agent_id = a.agent_id
  AND g.event_type = a.event_type AND g.event_name = a.event_name
WHERE a.created_at >= d.dt AND a.created_at < d.dt + INTERVAL '1 day'
GROUP BY a.agent_id, a.event_type, a.event_name, g.count
ORDER BY raw_count DESC
LIMIT 10;
```

Expected: `raw_count == agg_count` for every row. If a row shows `agg_count = NULL` or mismatched, aggregation has a bug — stop and investigate.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-analytics-daily.js
git commit -m "feat(analytics): one-shot backfill script for historical aggregation"
```

---

## Task 8: Update Docs

**Files:**
- Modify: `docs/project-summary.md`

- [ ] **Step 1: Update table list**

Find [docs/project-summary.md:18](../../../docs/project-summary.md#L18) (the one-line "15 tabel" list). Update count and add `analytics_events_daily` alphabetically in the list:

Replace:
```
15 tabel: `agents`, `capi_configs`, `capi_event_logs`, `jamaah`, `jamaah_haji`, `calendar_events`, `calendar_insights`, `ai_credits`, `flight_status`, `flight_shares`, `itineraries`, `haji_plus_stats`, `analytics_events`, `umroh_schedules`, `kurs_cache`
```

With:
```
16 tabel: `agents`, `capi_configs`, `capi_event_logs`, `jamaah`, `jamaah_haji`, `calendar_events`, `calendar_insights`, `ai_credits`, `flight_status`, `flight_shares`, `itineraries`, `haji_plus_stats`, `analytics_events`, `analytics_events_daily`, `umroh_schedules`, `kurs_cache`
```

- [ ] **Step 2: Add schema section for `analytics_events_daily`**

Find the `### Tabel analytics_events` block at [docs/project-summary.md:502](../../../docs/project-summary.md#L502). Insert directly after its closing ``` a new section:

```markdown
### Tabel `analytics_events_daily`
```
date        DATE NOT NULL        -- hari (YYYY-MM-DD)
agent_id    UUID NOT NULL        -- FK to agents.id; '00000000-...-000' utk anonymous (login_failed no-agent)
event_type  TEXT NOT NULL        -- sama seperti analytics_events.event_type
event_name  TEXT NOT NULL        -- sama seperti analytics_events.event_name
count       INTEGER NOT NULL     -- jumlah event untuk kombinasi (date, agent_id, event_type, event_name)
updated_at  TIMESTAMPTZ          -- waktu agregat terakhir di-upsert
-- PRIMARY KEY (date, agent_id, event_type, event_name)
-- Index: idx_analytics_daily_date ON (date DESC)
-- Index: idx_analytics_daily_agent ON (agent_id, date DESC)
-- Populated by: cron 02:00 WIB (runAnalyticsMaintenance)
```
```

- [ ] **Step 3: Commit**

```bash
git add docs/project-summary.md
git commit -m "docs: add analytics_events_daily to tables reference"
```

---

## Post-Implementation Verification

Setelah semua task selesai dan backfill dijalankan:

1. **Monitor cron run berikutnya** (besok 02:00 WIB). Cek log:
   - `[Analytics] Aggregated N events into M daily rows for YYYY-MM-DD`
   - `[Analytics] Deleted X raw analytics_events rows older than ...`
   - `[CAPI] Deleted Y raw capi_event_logs rows older than ...`

2. **Row counts Supabase** (via Dashboard atau SQL):
   ```sql
   SELECT 'analytics_events' AS t, COUNT(*) FROM analytics_events
   UNION ALL SELECT 'analytics_events_daily', COUNT(*) FROM analytics_events_daily
   UNION ALL SELECT 'capi_event_logs', COUNT(*) FROM capi_event_logs;
   ```
   Expected: `analytics_events` dan `capi_event_logs` turun drastis (hanya ~14 hari terakhir), `analytics_events_daily` tumbuh linear.

3. **Regression:** re-hit `/api/analytics/summary` untuk bulan terakhir-3 → dashboard admin harus menampilkan angka yang masuk akal (bukan semua 0).

4. **Idempotency sanity:** re-run backfill script sekali lagi. Expected: row counts di `analytics_events_daily` tidak berubah (upsert on PK overwrites dengan nilai sama).
