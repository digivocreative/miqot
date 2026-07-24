# Multi-leg flight "anchor-leg" time trust — design spec

- **Date:** 2026-07-24
- **Status:** Approved design, pending implementation plan
- **Area:** Flight status cards (`Status Penerbangan`) — calendar-derived fallback path
- **Author:** Bagas Pramudita (with Claude)

## 1. Problem

Multi-leg (transit) flight cards render as **`unverified` → "Perlu Cek"** even when the
trip's real clock is known. An audit of upcoming umroh flights (window 2026-07-23 →
2026-11-21, 119 flight events) found:

| Bucket | Count | Today's status | Cause |
|--------|-------|----------------|-------|
| Single-leg, valid clock | 68 | ✅ Dijadwalkan | — |
| Single-leg, no clock | 4 | Perlu Cek | missing `jam` (data) — separate |
| **Multi-leg, valid clock** | **42** | **Perlu Cek** | **`operationalTimeTrusted` guard (this spec)** |
| Multi-leg, no clock | 5 | Perlu Cek | data errors (see §8 worklist) |

The 42 multi-leg records (mostly Emirates via Dubai `EK357+EK809` / `EK802+EK358`, plus
Saudia multi-city) have a real, admin-entered trip clock but are forced to "Perlu Cek"
by a deliberate code guard, not by missing data.

### Root cause

`deriveCalendarFlightSegmentTimes` (`server.js`) hard-codes, per leg:

```js
operationalTimeTrusted: chain.length === 1
```

For any chain longer than one flight code this is `false` for every leg, so
`hasReliableFlightTimes()` (`lib/flight-fallback-state.js:2`) short-circuits to `false`
and `computeFallbackFlightState()` returns `unverified`. The guard exists for a good
reason — a multi-leg chain derived from ONE trip-level clock has genuinely fabricated
*intermediate* leg clocks (zero-layover assumption). But the **anchor leg** carries the
real clock the admin entered:

- **keberangkatan** → first leg's departure (the group's real CGK take-off time)
- **kepulangan** → last leg's arrival (the real CGK landing time)

Trusting the anchor leg's clock — and only the anchor — is both safe and correct.

## 2. Goals / non-goals

**Goals**
- Multi-leg cards with a valid trip clock show `Dijadwalkan` before departure, with the
  jamaah-relevant endpoint time (CGK departure for keberangkatan, CGK arrival for
  kepulangan).
- Fix all 42 current records + every future clean multi-leg trip, with no admin action.
- Preserve the existing safety invariant: calendar data may only ever produce
  `scheduled`/`unverified`; `landed`/`en-route`/`progress`/`delay` still require fresh
  provider data.

**Non-goals**
- The 5 marker-only records (SV275×4, HU791×1) — verified NO-OP for this patch; they are
  upstream data errors, tracked separately in §8.
- Any change to the provider-backed (AirLabs) path.
- Filling timezone-table gaps (`HAK`, `SAW`) — follow-up, affects only out-of-scope records.

## 3. Approach (chosen: A — anchor-leg trust)

Two surgical changes, no new concepts.

| # | File | Change | Runtime |
|---|------|--------|---------|
| 1 | `server.js` — `buildTimes` inside `deriveCalendarFlightSegmentTimes` | `operationalTimeTrusted` follows the anchor rule | backend → deploy |
| 2a | `lib/flight-entry-merge.js` — `activeSegmentForEntries` | prefer `scheduled` over `unverified` | backend + frontend → deploy + build |
| 2b | `src/lib/flightActiveSegment.ts` — `selectActiveFlightSegment` | mirror of 2a | frontend → build |

Approaches B (trust the whole chain) and C (trip-level status field) were considered and
rejected: B trusts fabricated intermediate clocks and surfaces the wrong endpoint on
kepulangan cards; C is a disproportionately large change.

### Change 1 — anchor-leg time trust

The 4th parameter of `buildTimes`, `operationalDateTrusted`, already holds exactly the
anchor expression (`chain.length === 1 || i === <anchor index>`), computed at each call
site:

- kepulangan: `buildTimes(route, depUTC, arrUTC, chain.length === 1 || i === chain.length - 1)`
- keberangkatan: `buildTimes(route, depUTC, arrUTC, chain.length === 1 || i === 0)`

So the change is to source `operationalTimeTrusted` from it:

```js
// server.js, inside buildTimes(route, depUTC, arrUTC, operationalDateTrusted)
-      operationalTimeTrusted: chain.length === 1,
+      // The anchor leg (first-leg departure for keberangkatan, last-leg arrival for
+      // kepulangan) carries the admin-entered trip clock — a REAL time, not a
+      // chain-inferred one. Trust its clock exactly where we already trust its date.
+      // Intermediate legs stay untrusted.
+      operationalTimeTrusted: operationalDateTrusted,
```

Only the anchor leg becomes `operationalTimeTrusted: true`; intermediate legs stay
`false`. Single-leg chains are unchanged (`chain.length === 1` keeps the value `true`).

### Change 2 — active-segment prefers `scheduled` before a journey starts

Change 1 makes ONLY the anchor leg `scheduled`, so the merge can pick the anchor by
preferring `scheduled` — but ONLY when the journey hasn't started. The existing behavior
"once a leg has **landed**, the active segment is the first not-yet-complete leg by index"
must be preserved (a mid-journey in-progress `unverified` leg must not be skipped for a
later `scheduled` leg — locked by `tests/flight-entry-merge.test.js` "an unverified current
leg is not hidden by a later scheduled leg" and `tests/flight-active-segment.test.js`
`[landed, unverified, scheduled] → unverified`).

So gate the `scheduled` preference on "no leg has landed":

```js
// lib/flight-entry-merge.js  (activeSegmentForEntries)
// src/lib/flightActiveSegment.ts  (selectActiveFlightSegment)  — same shape, TS generics
   // ...after the en-route and delayed checks...
+  // Before a journey starts (no leg has landed), surface the leg carrying the trusted
+  // trip clock — under anchor-trust that is the only 'scheduled' leg. Once any leg has
+  // landed, fall through so an in-progress (unverified) leg is not skipped.
+  if (!entries.some(e => e.status === 'landed')) {
+    const scheduled = entries.find(e => e.status === 'scheduled');
+    if (scheduled) return scheduled;
+  }
   return entries.find(e => e.status === 'scheduled' || e.status === 'unverified')
     || [...entries].reverse().find(e => e.status === 'landed')
     || entries.find(e => e.status !== 'cancelled')
     || entries[0];
```

`en-route` / `delayed` still win first (live legs unaffected). All existing active-segment
tests have a `landed` leg, so they take the unchanged fall-through path; the new preference
only affects the entirely-pre-departure case (the anchor of a multi-leg journey).

## 4. End-to-end behavior

**Keberangkatan** `EK357+EK809`, `jam=17:40`:
- Anchor = leg 1 `EK357` (CGK→DXB): `depUTC=17:40` real → `operationalTimeTrusted:true` →
  reliable → `nowMs < depUTC` → `scheduled`. Leg 2 `EK809` → `unverified`.
- Merge picks `EK357` → card: **"Dijadwalkan · CGK→… berangkat 17:40"** + transit label.

**Kepulangan** `EK802+EK358`, `jam=22:25`:
- Anchor = leg 2 `EK358` (DXB→CGK): `arrUTC=22:25` real → `scheduled`. Leg 1 `EK802` →
  `unverified`.
- Merge picks `EK358` → card: **"Dijadwalkan · …→CGK tiba 22:25"** — the endpoint jamaah
  families watch. Status stays `scheduled` through the journey until near the (inferred)
  final-leg departure, then `Perlu Cek` — a sensible "trip upcoming" indicator.

## 5. Edge cases & safety

- **Single-leg (72 records): value identical** → zero regression.
- **Safety invariant preserved**: the calendar path can only yield `scheduled`/`unverified`.
  `landed`/`en-route`/`progress`/`delay` still require fresh provider data. The patch never
  fabricates an "in-flight/landed" state.
- **Anchor's complementary time is inferred** (dep for a kepulangan anchor, arr for a
  keberangkatan anchor) — it only shifts the `scheduled → unverified` boundary moment, it
  fabricates nothing.
- **Provider takeover** (within the poll window) overrides this path — untouched.
- **Transit label** on kepulangan shifts to "Menuju Jakarta" (final destination) — a benign
  cosmetic change; previously it read "Menuju <first stop>".
- **Timezone gaps** `HAK`/`SAW` (absent from `AIRPORT_TZ_OFFSETS`, default +7) affect only
  out-of-scope records. The 42 targets all use listed airports (CGK/DXB/JED/MED/IST).

## 6. Testing

Following repo conventions (server.js internals via source-regex guard tests; libs via
direct import):

- `tests/flight-entry-merge.test.js` — only-anchor-`scheduled` entries → merged status
  `scheduled` and active = anchor leg (both directions).
- `tests/flight-active-segment.test.js` — mirror for `selectActiveFlightSegment`.
- `tests/flight-fallback-state.test.js` — `operationalTimeTrusted:true` + future dep →
  `scheduled`; `false` → `unverified`.
- `tests/flight-marker-guard.test.js` — source guard: `operationalTimeTrusted: operationalDateTrusted`
  present; `operationalTimeTrusted: chain.length === 1` gone.
- One-off verification script (not committed) against live data: confirm the 42 flip to
  `scheduled` and the 5 remain no-op.
- `node --check server.js` + frontend build.
- User runs the e2e/full suite.

## 7. Rollout

- `server.js` + `lib/flight-entry-merge.js` → **DEPLOY** (server.js does not hot-reload).
- `src/lib/flightActiveSegment.ts` + `lib/flight-entry-merge.js` (imported by
  `FlightStatusCard.tsx`) → **build**.
- Prod domain: alhijaz.co.

## 8. Data worklist — the 5 marker-only records (upstream admin fix)

Out of scope for the code patch (verified no-op), but the reason the user asked to include
it. These are data-entry errors in the Alhijaz admin source. Because `calendar_events` and
`umroh_schedules` are re-scraped hourly (`calendar-api.js` upsert `onConflict:'id'`), the
fix must be made **in the Alhijaz admin**, not in Supabase (a DB edit is overwritten on the
next sync).

Two defects per record: (a) `pesawat` / schedule `pulang_kode_penerbangan` lists the wrong
flight for the home leg, and (b) `jam` is a bare day-offset marker with no clock.

| Record id | Grup / TL | jadwal | Now (`pesawat` / `jam`) | Home flight (real last leg) | Fix |
|-----------|-----------|--------|--------------------------|-----------------------------|-----|
| `2026-08-23_kepulangan_25` | 25 · Olivia Nur Sandrani | JBU1493 | `SAUDIA ~ SV 275` / `(+7)` | **SV 818** (JED→CGK) | set `pesawat`/leg to SV 818 + real CGK arrival `jam` |
| `2026-09-12_kepulangan_35` | 35 | JBU1511 | `SAUDIA ~ SV 275` / `(+7)` | **SV 818** (JED→CGK) | idem |
| `2026-10-21_kepulangan_55` | 55 | JBU1510 | `SAUDIA ~ SV 275` / `(+7)` | **SV 818** (JED→CGK) | idem |
| `2026-10-21_kepulangan_56` | 56 | JBU1510 | `SAUDIA ~ SV 275` / `(+7)` | **SV 818** (JED→CGK) | idem |
| `2026-10-19_kepulangan_55` | 55 | JBU1585 | `HAINAN ~ HU 791` / `(+3)` | **HU 701** (HAK→CGK) | set to HU 701 + real CGK arrival `jam` |

Notes:
- The `(+N)` marker (`(+7)` = 7-day Istanbul tour span; `(+3)` = 3-day Haikou transit) is
  a real day-offset — keep it, but it must accompany a real clock, and the flight code
  must be the home leg (`SV 818` / `HU 701`), not the outbound-to-tour leg (`SV 275`) or a
  code that matches nothing (`HU 791` → intended `HU 701`).
- **Arrival times must come from the actual e-ticket / PNR.** Web research: SV 818 JED→CGK
  arrival = UNKNOWN (SV 275 is a JED→IST flight, no defensible clock); HU 701 HAK→CGK ≈
  18:10 (+3) at medium confidence (confirm against the PNR — could be a different HAK→CGK
  charter slot).
- After both defects are fixed upstream, these become normal multi-leg records and are
  covered by the code patch above (anchor = `SV 818` / `HU 701` arrival).

## 9. Open questions / follow-ups (not blocking)

- `AIRPORT_TZ_OFFSETS` missing `HAK` (UTC+8) and `SAW` (UTC+3). Add them so any future
  itinerary whose endpoint is an unlisted airport doesn't get a silently-wrong (+7-default)
  clock.
- Consider extracting `deriveCalendarFlightSegmentTimes` into a `lib/` module for direct
  unit testing (currently only source-regex-testable). Optional; out of scope here.
