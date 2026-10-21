import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANON_AGENT,
  KEY_SEP,
  buildCountMap,
  countMapToRows,
  computeRangeSplit,
  computeDailyReadPlan,
  countMatches,
  tallyBy,
} from '../lib/analytics-maintenance.js';
import * as maintenance from '../lib/analytics-maintenance.js';

test('buildCountMap: groups by (agent_id|event_type|event_name) and coalesces null agent_id to sentinel', () => {
  const rows = [
    { agent_id: 'a1', event_type: 'action', event_name: 'sync_jamaah' },
    { agent_id: 'a1', event_type: 'action', event_name: 'sync_jamaah' },
    { agent_id: 'a2', event_type: 'login', event_name: 'login' },
    { agent_id: null, event_type: 'login', event_name: 'login_failed' },
    { agent_id: null, event_type: 'login', event_name: 'login_failed' },
  ];
  const m = buildCountMap(rows);
  assert.equal(m.get(`a1${KEY_SEP}action${KEY_SEP}sync_jamaah`), 2);
  assert.equal(m.get(`a2${KEY_SEP}login${KEY_SEP}login`), 1);
  assert.equal(m.get(`${ANON_AGENT}${KEY_SEP}login${KEY_SEP}login_failed`), 2);
});

test('countMapToRows: builds upsert rows with the given dateKey', () => {
  const m = new Map([
    [`a1${KEY_SEP}action${KEY_SEP}sync_jamaah`, 2],
    [`a2${KEY_SEP}login${KEY_SEP}login`, 1],
  ]);
  const rows = countMapToRows(m, '2026-04-10');
  assert.equal(rows.length, 2);
  const byKey = Object.fromEntries(rows.map(r => [`${r.agent_id}${KEY_SEP}${r.event_type}${KEY_SEP}${r.event_name}`, r]));
  assert.deepEqual(
    { date: byKey[`a1${KEY_SEP}action${KEY_SEP}sync_jamaah`].date, count: byKey[`a1${KEY_SEP}action${KEY_SEP}sync_jamaah`].count },
    { date: '2026-04-10', count: 2 }
  );
  assert.equal(byKey[`a2${KEY_SEP}login${KEY_SEP}login`].count, 1);
  assert.ok(byKey[`a1${KEY_SEP}action${KEY_SEP}sync_jamaah`].updated_at);
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

test('buildCountMap: event_name containing pipe is preserved (regression)', () => {
  const rows = [
    { agent_id: 'a1', event_type: 'action', event_name: 'foo|bar' },
  ];
  const m = buildCountMap(rows);
  const rowsOut = countMapToRows(m, '2026-04-18');
  assert.equal(rowsOut.length, 1);
  assert.equal(rowsOut[0].event_name, 'foo|bar');
});

test('computeRangeSplit: cutoffMidnight alignment — rawStartISO is always on a UTC day boundary', () => {
  // Pick three different hours-of-day to confirm rawStartISO is invariant.
  const cases = [
    new Date('2026-04-18T00:15:00Z').getTime(),
    new Date('2026-04-18T12:00:00Z').getTime(),
    new Date('2026-04-18T23:45:00Z').getTime(),
  ];
  for (const nowMs of cases) {
    const split = computeRangeSplit(
      '2026-04-01T00:00:00.000Z',
      '2026-04-30T23:59:59.999Z',
      nowMs,
    );
    // cutoff day = 2026-04-04 regardless of hour
    assert.equal(split.rawStartISO, '2026-04-04T00:00:00.000Z');
    assert.equal(split.aggEndDate, '2026-04-03');
  }
});

test('computeDailyReadPlan: uses aggregate through latest rolled-up day and raw afterwards', () => {
  const now = new Date('2026-05-14T04:00:00Z').getTime();
  const plan = computeDailyReadPlan(
    '2026-05-01T00:00:00.000Z',
    '2026-05-31T23:59:59.999Z',
    now,
    '2026-05-13',
  );

  assert.equal(plan.useAgg, true);
  assert.equal(plan.aggStartDate, '2026-05-01');
  assert.equal(plan.aggEndDate, '2026-05-13');
  assert.deepEqual(plan.rawRanges, [
    { startISO: '2026-05-14T00:00:00.000Z', endISO: '2026-05-31T23:59:59.999Z' },
  ]);
});

test('computeDailyReadPlan: raw starts after stale latest aggregate date', () => {
  const now = new Date('2026-05-14T04:00:00Z').getTime();
  const plan = computeDailyReadPlan(
    '2026-05-01T00:00:00.000Z',
    '2026-05-31T23:59:59.999Z',
    now,
    '2026-05-07',
  );

  assert.equal(plan.aggStartDate, '2026-05-01');
  assert.equal(plan.aggEndDate, '2026-05-07');
  assert.deepEqual(plan.rawRanges, [
    { startISO: '2026-05-08T00:00:00.000Z', endISO: '2026-05-31T23:59:59.999Z' },
  ]);
});

test('computeDailyReadPlan: keeps partial boundary days in raw ranges', () => {
  const now = new Date('2026-05-14T04:00:00Z').getTime();
  const plan = computeDailyReadPlan(
    '2026-05-01T06:00:00.000Z',
    '2026-05-14T04:00:00.000Z',
    now,
    '2026-05-13',
  );

  assert.equal(plan.aggStartDate, '2026-05-02');
  assert.equal(plan.aggEndDate, '2026-05-13');
  assert.deepEqual(plan.rawRanges, [
    { startISO: '2026-05-01T06:00:00.000Z', endISO: '2026-05-01T23:59:59.999Z' },
    { startISO: '2026-05-14T00:00:00.000Z', endISO: '2026-05-14T04:00:00.000Z' },
  ]);
});

// ── Retention: CAPI event logs pruned more aggressively than analytics ──

const DAY_MS = 24 * 60 * 60 * 1000;

test('retention constants: CAPI logs = 5 days, analytics raw stays 14 days (decoupled)', () => {
  assert.equal(maintenance.CAPI_RETENTION_DAYS, 5);
  assert.equal(maintenance.RAW_RETENTION_DAYS, 14);
});

test('retentionCutoffISO: returns UTC-midnight N days before now', () => {
  assert.equal(typeof maintenance.retentionCutoffISO, 'function');
  const now = new Date('2026-06-01T10:30:00.000Z').getTime();
  assert.equal(maintenance.retentionCutoffISO(now, 5), '2026-05-27T00:00:00.000Z');
  assert.equal(maintenance.retentionCutoffISO(now, 14), '2026-05-18T00:00:00.000Z');
});

test('retentionCutoffISO: cutoff is invariant to the hour-of-day of now', () => {
  assert.equal(typeof maintenance.retentionCutoffISO, 'function');
  for (const hms of ['T00:15:00Z', 'T12:00:00Z', 'T23:45:00Z']) {
    const now = new Date(`2026-06-01${hms}`).getTime();
    assert.equal(maintenance.retentionCutoffISO(now, 5), '2026-05-27T00:00:00.000Z');
  }
});

// Minimal Supabase test double. Records the `created_at` cutoff each table's
// DELETE was issued with, and which tables were fetched with `.order()`.
// Options:
//   latestAgg     — date returned by fetchLatestAggregateDate (default yesterday)
//   failAggregate — aggregate-date lookup errors → aggregation setup throws
//   dayHasEvents  — analytics_events fetch returns a row (forces an upsert)
//   aggUpsertError— analytics_events_daily upsert errors (a day fails to aggregate)
function makeMockSupabase(yesterdayKey, opts = {}) {
  const deletedCutoffs = {};
  const ordered = new Set();
  function builder(table) {
    let op = 'select';
    const chain = {
      select() { op = 'select'; return chain; },
      delete() { op = 'delete'; return chain; },
      upsert() {
        if (table === 'analytics_events_daily' && opts.aggUpsertError) {
          return Promise.resolve({ error: { message: 'simulated upsert failure' } });
        }
        return Promise.resolve({ error: null });
      },
      lte() { return chain; },
      gte() { return chain; },
      order() { ordered.add(table); return chain; },
      limit() { return chain; },
      range() {
        if (table === 'analytics_events' && opts.dayHasEvents) {
          return Promise.resolve({ data: [{ agent_id: 'a1', event_type: 'x', event_name: 'y' }], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      lt(col, val) {
        if (op === 'delete') {
          if (col === 'created_at') deletedCutoffs[table] = val;
          return Promise.resolve({ error: null, count: 0 });
        }
        return chain;
      },
      maybeSingle() {
        if (table === 'analytics_events_daily') {
          if (opts.failAggregate) {
            return Promise.resolve({ data: null, error: { message: 'simulated aggregate lookup failure' } });
          }
          return Promise.resolve({ data: { date: opts.latestAgg || yesterdayKey }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  }
  return { from: builder, deletedCutoffs, ordered };
}

test('runAnalyticsMaintenance: prunes capi_event_logs at 5d and analytics_events at 14d', async () => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  const supabase = makeMockSupabase(yesterdayKey);
  await maintenance.runAnalyticsMaintenance(supabase);

  const capiCutoff = supabase.deletedCutoffs['capi_event_logs'];
  const analyticsCutoff = supabase.deletedCutoffs['analytics_events'];
  assert.ok(capiCutoff, 'capi_event_logs DELETE cutoff was captured');
  assert.ok(analyticsCutoff, 'analytics_events DELETE cutoff was captured');

  // Both aligned to UTC midnight
  assert.match(capiCutoff, /T00:00:00\.000Z$/);
  assert.match(analyticsCutoff, /T00:00:00\.000Z$/);

  // CAPI cutoff sits ~5 days back (midnight alignment puts age in [5d, 6d))
  const capiAge = now.getTime() - Date.parse(capiCutoff);
  assert.ok(capiAge >= 5 * DAY_MS && capiAge < 6 * DAY_MS, `capi cutoff ~5d back, got ${(capiAge / DAY_MS).toFixed(2)}d`);

  // Decoupled: CAPI keeps 9 fewer days than analytics (5 vs 14), so its cutoff
  // sits exactly 9 days more recent than the analytics cutoff.
  assert.equal(Date.parse(capiCutoff) - Date.parse(analyticsCutoff), 9 * DAY_MS);
});

test('runAnalyticsMaintenance: prunes capi_event_logs even when analytics aggregation fails', async () => {
  // CAPI logs are never aggregated, so their cleanup must not be blocked by an
  // analytics aggregation failure (the bug that let CAPI logs pile up in prod).
  const supabase = makeMockSupabase('2026-05-31', { failAggregate: true });
  await maintenance.runAnalyticsMaintenance(supabase);

  assert.ok(supabase.deletedCutoffs['capi_event_logs'], 'capi_event_logs still pruned despite aggregation failure');
  // analytics_events raw must NOT be deleted when aggregation failed — those rows
  // haven't been rolled up yet, so deleting them would lose data.
  assert.equal(supabase.deletedCutoffs['analytics_events'], undefined, 'analytics_events raw kept when aggregation fails');
});

test('runAnalyticsMaintenance: a single day that fails to aggregate does not wedge cleanup', async () => {
  // This is the prod incident: one poisoned day (2026-05-20) threw on every run and,
  // because the throw escaped the catch-up loop, disabled cleanup entirely. A per-day
  // failure must be isolated so the rest of the cycle (incl. cleanup) still completes.
  const now = new Date();
  const y = new Date(now); y.setUTCHours(0, 0, 0, 0); y.setUTCDate(y.getUTCDate() - 1);
  const yKey = y.toISOString().slice(0, 10);
  const before = new Date(y); before.setUTCDate(before.getUTCDate() - 1);
  const latestAgg = before.toISOString().slice(0, 10); // loop processes exactly one day

  const supabase = makeMockSupabase(yKey, { latestAgg, dayHasEvents: true, aggUpsertError: true });
  await maintenance.runAnalyticsMaintenance(supabase);

  assert.ok(
    supabase.deletedCutoffs['analytics_events'],
    'analytics cleanup still runs even though a day failed to aggregate',
  );
});

test('aggregateAnalyticsDay: paginated fetch is ordered for deterministic paging', async () => {
  // .range() pagination without ORDER BY can skip/duplicate rows across pages.
  const supabase = makeMockSupabase('2026-05-31', { dayHasEvents: true });
  await maintenance.aggregateAnalyticsDay(
    supabase,
    '2026-05-20T00:00:00.000Z',
    '2026-05-21T00:00:00.000Z',
  );
  assert.ok(supabase.ordered.has('analytics_events'), 'analytics_events fetch uses .order() for stable pagination');
});

// In-memory PostgREST double for the read path. Honors select/gte/lte/gt/
// order/limit/range. A query WITHOUT .order() gets its rows rotated by a
// different offset on every request — like Postgres, which promises no order
// without ORDER BY — so unordered OFFSET paging returns overlapping pages, the
// exact failure measured in prod on 2026-10-21 (5,000 dupes in a 16k read).
function makeEventsSupabase({ raw = [], agg = [] }) {
  const calls = [];
  function builder(table) {
    const q = { filters: [], orders: [], select: null, limit: null };
    const src = table === 'analytics_events' ? raw : agg;
    function run(from, to) {
      calls.push({ table, select: q.select, ordered: q.orders.length > 0, from, to });
      let rows = src.filter(r => q.filters.every(f => f(r)));
      if (q.orders.length) {
        rows.sort((a, b) => {
          for (const [col, asc] of q.orders) {
            if (a[col] < b[col]) return asc ? -1 : 1;
            if (a[col] > b[col]) return asc ? 1 : -1;
          }
          return 0;
        });
      } else if (rows.length) {
        const k = (calls.length * 397) % rows.length;
        rows = [...rows.slice(k), ...rows.slice(0, k)];
      }
      const cols = q.select ? q.select.split(',').map(c => c.trim()) : null;
      const data = rows.slice(from, to + 1).map(r => (cols ? Object.fromEntries(cols.map(c => [c, r[c]])) : { ...r }));
      return { data, error: null };
    }
    const chain = {
      select(cols) { q.select = cols; return chain; },
      gte(c, v) { q.filters.push(r => r[c] >= v); return chain; },
      lte(c, v) { q.filters.push(r => r[c] <= v); return chain; },
      gt(c, v) { q.filters.push(r => r[c] > v); return chain; },
      order(c, o) { q.orders.push([c, o?.ascending !== false]); return chain; },
      limit(n) { q.limit = n; return chain; },
      range(from, to) { return Promise.resolve(run(from, to)); },
      maybeSingle() { return Promise.resolve({ data: run(0, 0).data[0] ?? null, error: null }); },
      then(resolve, reject) { return Promise.resolve(run(0, (q.limit ?? 1e9) - 1)).then(resolve, reject); },
    };
    return chain;
  }
  return { from: builder, calls };
}

function makeRawEvents(n, startMs) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    agent_id: `a${i % 7}`,
    event_type: i % 3 ? 'feature' : 'public',
    event_name: `e${i % 5}`,
    metadata: { big: 'x'.repeat(50) },
    created_at: new Date(startMs + i * 30_000).toISOString(),
  }));
}

function makeAggRows(dates, perDay) {
  const rows = [];
  for (const date of dates) {
    for (let i = 0; i < perDay; i++) {
      rows.push({ date, agent_id: `a${i % 50}`, event_type: 'feature', event_name: `e${Math.floor(i / 50)}`, count: 1 });
    }
  }
  return rows;
}

test('fetchEventsForRanges: paged reads are totally ordered — no duplicated or missing rows', async () => {
  const nowMs = Date.parse('2026-10-21T02:00:00.000Z');
  const raw = makeRawEvents(2500, Date.parse('2026-10-20T00:00:00.000Z'));
  const aggDates = ['2026-10-17', '2026-10-18', '2026-10-19'];
  const agg = makeAggRows(aggDates, 900); // 2,700 rows → 3 OFFSET pages
  const supabase = makeEventsSupabase({ raw, agg });

  const [{ rawEvents, aggEvents }] = await maintenance.fetchEventsForRanges(supabase, [
    { startISO: '2026-10-17T00:00:00.000Z', endISO: new Date(nowMs).toISOString() },
  ], nowMs);

  const rawInRange = raw.filter(r => r.created_at <= new Date(nowMs).toISOString());
  assert.equal(rawEvents.length, rawInRange.length);
  assert.equal(new Set(rawEvents.map(r => r.id)).size, rawInRange.length, 'raw: no duplicated/missing rows across pages');
  assert.equal(aggEvents.length, agg.length);
  assert.equal(
    new Set(aggEvents.map(r => `${r.date}|${r.agent_id}|${r.event_type}|${r.event_name}`)).size,
    agg.length,
    'agg: no duplicated/missing rows across pages',
  );
  assert.ok(supabase.calls.filter(c => c.table === 'analytics_events').every(c => c.ordered));
  assert.ok(supabase.calls.filter(c => c.table === 'analytics_events_daily').every(c => c.ordered));
  // metadata is never read by the summary — don't ship it over the wire.
  assert.ok(rawEvents.every(r => !('metadata' in r)));
  // Raw rows come back newest first.
  assert.ok(rawEvents.every((r, i) => i === 0 || rawEvents[i - 1].created_at >= r.created_at));
});

test('fetchEventsForRanges: the month and the 7-day window share one fetch of their raw tail', async () => {
  const nowMs = Date.parse('2026-10-21T02:00:00.000Z');
  const nowISO = new Date(nowMs).toISOString();
  const raw = makeRawEvents(1500, Date.parse('2026-10-20T00:00:00.000Z')); // 2 keyset pages
  const agg = makeAggRows(['2026-10-01', '2026-10-15', '2026-10-19'], 10);
  const supabase = makeEventsSupabase({ raw, agg });

  const [month, week] = await maintenance.fetchEventsForRanges(supabase, [
    { startISO: '2026-10-01T00:00:00.000Z', endISO: nowISO },
    { startISO: '2026-10-15T00:00:00.000Z', endISO: nowISO },
  ], nowMs);

  const rawPages = supabase.calls.filter(c => c.table === 'analytics_events').length;
  assert.equal(rawPages, 2, 'shared raw tail is paged once, not once per range');
  assert.equal(month.rawEvents.length, 1500);
  assert.equal(week.rawEvents.length, 1500);
  assert.notEqual(month.rawEvents, week.rawEvents, 'each range gets its own array (safe to sort/mutate)');
  assert.equal(month.aggEvents.length, 30);
  assert.equal(week.aggEvents.length, 20);
});
