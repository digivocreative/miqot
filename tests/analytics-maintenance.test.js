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
