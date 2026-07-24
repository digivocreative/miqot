# Multi-leg Flight Anchor-Leg Time Trust — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-leg (transit) flight cards with a valid trip clock show `Dijadwalkan` (with the jamaah-relevant endpoint) instead of `Perlu Cek`, by trusting the anchor leg's clock and surfacing it pre-departure.

**Architecture:** Two surgical changes. (1) In `server.js`, the anchor leg's `operationalTimeTrusted` follows the already-computed anchor flag `operationalDateTrusted` (first-leg departure for keberangkatan, last-leg arrival for kepulangan). (2) In the active-segment selectors (backend `lib/flight-entry-merge.js` + frontend `src/lib/flightActiveSegment.ts`), prefer a `scheduled` leg over `unverified` legs **only when no leg has landed**, so the anchor is surfaced pre-departure without disturbing mid-journey behavior.

**Tech Stack:** Node.js (ES modules), `node:test` + `node:assert/strict`, esbuild (TS transform in tests), React/TS frontend.

## Global Constraints

- Safety invariant: the calendar-derived path may only ever produce `scheduled`/`unverified`. `landed`/`en-route`/`progress`/`delay` still require fresh provider (AirLabs) data. No change may let calendar data fabricate an in-flight/landed state.
- Single-leg behavior must be byte-for-byte unchanged (72 upcoming single-leg records).
- Follow repo test conventions: `server.js` internals are guarded by source-regex assertions (`tests/flight-marker-guard.test.js`); libs are imported and unit-tested; TS libs are loaded via esbuild `transformSync` (see `tests/flight-active-segment.test.js`).
- Deterministic tests only: pass an explicit `nowMs` to `computeFallbackFlightState`; never rely on wall-clock.
- `server.js` and `lib/*.js` require a **deploy** (no hot reload); frontend TS requires a **build**. Deployment is the user's step — do not push/deploy.
- Do NOT stage or commit unrelated working-tree changes from other sessions (`.DS_Store`, `src/components/**Brochure**`, `src/new-logo/`, `public/new-logo-*`, `*devBrosurPreview*`). Stage only the exact files listed per task.

---

### Task 1: Backend active-segment — prefer scheduled anchor pre-departure

**Files:**
- Modify: `lib/flight-entry-merge.js` (`activeSegmentForEntries`, ~line 138-146)
- Test: `tests/flight-entry-merge.test.js`

**Interfaces:**
- Consumes: `mergeFlightEntriesByTourLeader(flights: Entry[]) => MergedEntry[]` (already exported).
- Produces: no signature change. Behavioral change only: for a multi-leg journey where no leg has `landed`, the merged card adopts the first `scheduled` leg (the anchor). When any leg has `landed`, selection is unchanged (first `scheduled`-or-`unverified` by segment index).

- [ ] **Step 1: Write the failing test**

Append to `tests/flight-entry-merge.test.js`:

```js
test('a pre-departure return journey surfaces the scheduled anchor (last leg), not the first unverified leg', () => {
  const base = {
    eventDate: '2026-08-15', group: '21', tourLeader: 'TEST LEADER', pax: 1,
    _mergeSourceKey: 'return-anchor', _segmentCount: 2,
  };
  const [merged] = mergeFlightEntriesByTourLeader([
    { ...base, id: 'leg1', flightNumber: 'EK 802', status: 'unverified', depCode: 'JED', arrCode: 'DXB', _segmentIndex: 0 },
    { ...base, id: 'leg2', flightNumber: 'EK 358', status: 'scheduled', depCode: 'DXB', arrCode: 'CGK', arrScheduled: '22:25', _segmentIndex: 1 },
  ]);
  assert.equal(merged.flightNumber, 'EK 358');
  assert.equal(merged.status, 'scheduled');
  assert.equal(merged.arrCode, 'CGK');
  assert.equal(merged.arrScheduled, '22:25');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flight-entry-merge.test.js`
Expected: FAIL — the new test reports `merged.flightNumber` is `'EK 802'` / `merged.status` is `'unverified'` (current logic picks the first `scheduled`-or-`unverified` leg by index).

- [ ] **Step 3: Write minimal implementation**

In `lib/flight-entry-merge.js`, replace `activeSegmentForEntries` with:

```js
function activeSegmentForEntries(entries) {
  if (!entries.length) return null;
  // Before a journey starts (no leg has landed), surface the leg carrying the
  // trusted trip clock — under anchor-trust that is the only 'scheduled' leg.
  // Once any leg has landed, fall through so an in-progress (unverified) leg is
  // not skipped for a later scheduled leg.
  const journeyStarted = entries.some(entry => entry.status === 'landed');
  return entries.find(entry => entry.status === 'en-route')
    || entries.find(entry => entry.status === 'delayed')
    || (journeyStarted ? null : entries.find(entry => entry.status === 'scheduled'))
    || entries.find(entry => entry.status === 'scheduled' || entry.status === 'unverified')
    || [...entries].reverse().find(entry => entry.status === 'landed')
    || entries.find(entry => entry.status !== 'cancelled')
    || entries[0];
}
```

- [ ] **Step 4: Run tests to verify pass + no regression**

Run: `node --test tests/flight-entry-merge.test.js`
Expected: PASS — the new test passes AND the existing tests still pass, in particular "an unverified current leg is not hidden by a later scheduled leg" (`[landed, unverified, scheduled] → unverified`) and "the earliest upcoming scheduled leg is not skipped for a later unverified leg".

- [ ] **Step 5: Commit**

```bash
git add lib/flight-entry-merge.js tests/flight-entry-merge.test.js
git commit -m "fix(flights): surface scheduled anchor leg for pre-departure multi-leg cards"
```

---

### Task 2: Frontend active-segment mirror

**Files:**
- Modify: `src/lib/flightActiveSegment.ts` (`selectActiveFlightSegment`)
- Test: `tests/flight-active-segment.test.js`

**Interfaces:**
- Consumes: `selectActiveFlightSegment<T extends { status?: string | null }>(fallback: T, segments?: readonly T[] | null): T` (already exported).
- Produces: same signature. Behavioral change identical to Task 1: pre-journey (no `landed` leg) prefers the first `scheduled` segment; otherwise unchanged.

- [ ] **Step 1: Write the failing test**

Append to `tests/flight-active-segment.test.js`:

```js
test('pre-departure journey (no landed leg) surfaces the scheduled anchor over an earlier unverified leg', async () => {
  const { selectActiveFlightSegment } = await importTsModule('src/lib/flightActiveSegment.ts');
  const fallback = { flightNumber: 'JOURNEY', status: 'scheduled' };
  const unverifiedFirst = { flightNumber: 'EK 802', status: 'unverified' };
  const scheduledAnchor = { flightNumber: 'EK 358', status: 'scheduled' };

  // No landed leg → prefer the scheduled anchor even though it is the later leg.
  assert.equal(selectActiveFlightSegment(fallback, [unverifiedFirst, scheduledAnchor]), scheduledAnchor);

  // Once a leg has landed, an in-progress unverified leg must NOT be skipped.
  const landed = { flightNumber: 'EK 802', status: 'landed' };
  assert.equal(selectActiveFlightSegment(fallback, [landed, unverifiedFirst, scheduledAnchor]), unverifiedFirst);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flight-active-segment.test.js`
Expected: FAIL — the first assertion fails; current logic returns `unverifiedFirst` (finds `scheduled`-or-`unverified` by index).

- [ ] **Step 3: Write minimal implementation**

Replace the body of `selectActiveFlightSegment` in `src/lib/flightActiveSegment.ts`:

```ts
export function selectActiveFlightSegment<T extends FlightStatusCarrier>(
  fallback: T,
  segments?: readonly T[] | null,
): T {
  if (!segments?.length) return fallback;

  // Before a journey starts (no leg has landed), surface the leg carrying the
  // trusted trip clock — under anchor-trust that is the only 'scheduled' leg.
  // Once any leg has landed, fall through so an in-progress (unverified) leg is
  // not skipped for a later scheduled leg.
  const journeyStarted = segments.some(segment => segment.status === 'landed');
  return segments.find(segment => segment.status === 'en-route')
    || segments.find(segment => segment.status === 'delayed')
    || (journeyStarted ? undefined : segments.find(segment => segment.status === 'scheduled'))
    || segments.find(segment => segment.status === 'scheduled' || segment.status === 'unverified')
    || [...segments].reverse().find(segment => segment.status === 'landed')
    || segments.find(segment => segment.status !== 'cancelled')
    || segments[0]
    || fallback;
}
```

- [ ] **Step 4: Run tests to verify pass + no regression**

Run: `node --test tests/flight-active-segment.test.js`
Expected: PASS — new test passes AND the existing "selects en-route, then delayed, then scheduled segment" test still passes (all its cases include a `landed` leg, so they take the unchanged path, including `[landed, unverified, scheduled] → unverified`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/flightActiveSegment.ts tests/flight-active-segment.test.js
git commit -m "fix(flights): mirror scheduled-anchor preference in frontend segment selector"
```

---

### Task 3: Anchor-leg time trust in server.js

**Files:**
- Modify: `server.js` — `buildTimes` inside `deriveCalendarFlightSegmentTimes` (the line `operationalTimeTrusted: chain.length === 1,`)
- Test: `tests/flight-marker-guard.test.js` (source guard), `tests/flight-fallback-state.test.js` (behavioral invariant)

**Interfaces:**
- Consumes: `computeFallbackFlightState(times, nowMs) => { status, progress }` and `hasReliableFlightTimes(times)` from `lib/flight-fallback-state.js` (already exported). `times.operationalTimeTrusted: boolean` gates `hasReliableFlightTimes`.
- Produces: after this change, `deriveCalendarFlightSegmentTimes` emits `operationalTimeTrusted: true` for the anchor leg of a chain (and for single-leg), `false` for intermediate legs. No signature change.

- [ ] **Step 1: Write the failing tests**

Append to `tests/flight-marker-guard.test.js`:

```js
test('anchor leg clock is trusted for multi-leg chains, intermediate legs are not', () => {
  // operationalTimeTrusted follows the anchor flag (operationalDateTrusted):
  // single-leg, or first-leg departure (keberangkatan) / last-leg arrival (kepulangan).
  assert.match(server, /operationalTimeTrusted: operationalDateTrusted/);
  assert.doesNotMatch(server, /operationalTimeTrusted: chain\.length === 1/);
});
```

Append to `tests/flight-fallback-state.test.js`:

```js
test('a trusted (anchor) leg time in the future is scheduled; an untrusted leg stays unverified', () => {
  const nowMs = Date.parse('2026-08-15T00:00:00Z');
  const depUTC = Date.parse('2026-08-15T10:00:00Z');
  const arrUTC = Date.parse('2026-08-15T13:00:00Z');

  assert.deepEqual(
    computeFallbackFlightState({ depUTC, arrUTC, operationalTimeTrusted: true }, nowMs),
    { status: 'scheduled', progress: 0 },
  );
  assert.deepEqual(
    computeFallbackFlightState({ depUTC, arrUTC, operationalTimeTrusted: false }, nowMs),
    { status: 'unverified', progress: 0 },
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/flight-marker-guard.test.js tests/flight-fallback-state.test.js`
Expected: FAIL — the marker-guard source test fails (`operationalTimeTrusted: operationalDateTrusted` is not yet present; `operationalTimeTrusted: chain.length === 1` still is). The fallback-state test passes already (it exercises `computeFallbackFlightState` directly, which already honors `operationalTimeTrusted`) — it documents the invariant the server change relies on.

- [ ] **Step 3: Write minimal implementation**

In `server.js`, inside `buildTimes(route, depUTC, arrUTC, operationalDateTrusted)`, replace:

```js
      operationalTimeTrusted: chain.length === 1,
```

with:

```js
      // The anchor leg (single-leg, or first-leg departure for keberangkatan /
      // last-leg arrival for kepulangan) carries the admin-entered trip clock — a
      // REAL time, not a chain-inferred one. Trust its clock exactly where we
      // already trust its date. Intermediate legs stay untrusted.
      operationalTimeTrusted: operationalDateTrusted,
```

- [ ] **Step 4: Run checks to verify pass**

Run: `node --check server.js && node --test tests/flight-marker-guard.test.js tests/flight-fallback-state.test.js`
Expected: PASS — `node --check` reports no syntax error; both test files pass.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/flight-marker-guard.test.js tests/flight-fallback-state.test.js
git commit -m "feat(flights): trust anchor-leg clock so multi-leg trips show Dijadwalkan"
```

---

### Task 4: Full-suite regression + live-data verification

**Files:**
- Create (temporary, DO NOT commit): `_tmp_verify_anchor.mjs`

**Interfaces:**
- Consumes: `parseFlightSegmentsFromCalendar`, `selectCalendarReportedSegments` (`lib/flight-segments.js`), `calendarJamForEvent`, `calendarDayOffsetForEvent` (`lib/calendar-jam.js`), Supabase service client via `dotenv`.
- Produces: console report only.

- [ ] **Step 1: Run the full flight test suite**

Run: `node --test tests/flight-*.test.js`
Expected: PASS — all flight tests green (entry-merge, active-segment, fallback-state, marker-guard, segments, route, share, etc.). Investigate any failure before proceeding.

- [ ] **Step 2: Build the frontend to typecheck the TS change**

Run: `npm run build`
Expected: build succeeds with no TypeScript error in `src/lib/flightActiveSegment.ts` or `src/components/FlightStatusCard.tsx`.

- [ ] **Step 3: Verify against live data (42 flip, 5 no-op)**

Create `_tmp_verify_anchor.mjs`:

```js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseFlightSegmentsFromCalendar, selectCalendarReportedSegments } from './lib/flight-segments.js';
import { calendarJamForEvent, calendarDayOffsetForEvent } from './lib/calendar-jam.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const iso = (d) => d.toISOString().slice(0, 10);
const now = new Date();
const { data: events } = await supabase.from('calendar_events')
  .select('id, event_date, event_type, pesawat, jam, jadwal_id')
  .in('event_type', ['keberangkatan', 'kepulangan'])
  .gte('event_date', iso(new Date(now - 864e5))).lte('event_date', iso(new Date(now.getTime() + 120 * 864e5)));
const jids = [...new Set(events.map(e => e.jadwal_id).filter(Boolean).map(String))];
const schMap = new Map();
for (let i = 0; i < jids.length; i += 200) {
  const { data } = await supabase.from('umroh_schedules')
    .select('jadwal_id, year_code, pulang_kode_penerbangan, berangkat_kode_penerbangan')
    .in('jadwal_id', jids.slice(i, i + 200)).order('year_code', { ascending: false });
  for (const r of data || []) if (!schMap.has(String(r.jadwal_id))) schMap.set(String(r.jadwal_id), r);
}
let multiWithClock = 0, multiNoClock = 0;
for (const ev of events) {
  const schedule = ev.jadwal_id ? schMap.get(String(ev.jadwal_id)) : null;
  const dayOffset = calendarDayOffsetForEvent(ev, schedule);
  const segs = dayOffset !== null
    ? selectCalendarReportedSegments(ev.pesawat, { eventType: ev.event_type, schedule })
    : parseFlightSegmentsFromCalendar(ev.pesawat, { eventType: ev.event_type, schedule });
  if (segs.length <= 1) continue;
  if (calendarJamForEvent(ev, schedule) !== null) multiWithClock++; else multiNoClock++;
}
console.log('multi-leg with clock (should flip to Dijadwalkan):', multiWithClock);
console.log('multi-leg no clock (stay Perlu Cek — data worklist):', multiNoClock);
process.exit(0);
```

Run: `node _tmp_verify_anchor.mjs`
Expected: `multi-leg with clock` ≈ 42 (these flip to Dijadwalkan after deploy); `multi-leg no clock` = 5 (unchanged, tracked in the spec §8 worklist). Numbers may drift as the calendar re-syncs; the point is the two buckets are non-overlapping and the with-clock bucket is the one the patch fixes.

- [ ] **Step 4: Remove the temp script (do not commit it)**

Run: `rm -f _tmp_verify_anchor.mjs`
Expected: working tree contains only the committed source/test changes from Tasks 1-3.

- [ ] **Step 5: Report status to the user**

Summarize: tests green, build green, live buckets confirmed. Remind the user this needs a **deploy** (server.js + libs) + **build** (frontend) to take effect on alhijaz.co, and that the 5 marker-only records still need the upstream admin data fix (spec §8).

---

## Self-Review

**Spec coverage:**
- §3 Change 1 (anchor `operationalTimeTrusted`) → Task 3. ✓
- §3 Change 2 (gated scheduled preference, both files) → Task 1 (backend) + Task 2 (frontend). ✓
- §5 safety invariant (calendar never fabricates landed/en-route) → preserved; Task 3 only toggles `operationalTimeTrusted` which feeds `computeFallbackFlightState` (scheduled/unverified only). ✓
- §5 single-leg unchanged → `chain.length === 1` case: `operationalDateTrusted` is `true`, identical value; noted in Task 3. ✓
- §6 testing (merge, active-segment, fallback, marker-guard, verification script, build) → Tasks 1-4. ✓
- §8 data worklist → out of scope for code; verification in Task 4 Step 3 confirms the 5 stay in the no-clock bucket; reported in Task 4 Step 5. ✓

**Placeholder scan:** No TBD/TODO; every code and command step is concrete. ✓

**Type consistency:** `selectActiveFlightSegment<T extends FlightStatusCarrier>` and `activeSegmentForEntries(entries)` signatures unchanged across tasks; `operationalTimeTrusted`/`operationalDateTrusted` names match `buildTimes`/`hasReliableFlightTimes`; `computeFallbackFlightState(times, nowMs)` matches existing test usage. ✓
