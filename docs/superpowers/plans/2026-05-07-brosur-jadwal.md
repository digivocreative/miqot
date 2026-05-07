# Brosur Jadwal Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Tools > Brosur Jadwal** that auto-renders a monthly Umroh package brochure (1080×1920 portrait) with the active agent's photo, name, WA, and website. Agent picks a month tab → brochure renders → can Share (Web Share API) or Download PNG.

**Architecture:** Server-side helpers in `lib/brochure-schedule.js` (pure ES module, tested with `node:test`) compute the per-month grouping and starting price from `umroh_schedules` table. New endpoint `GET /api/ai-tools/brosur-jadwal-bulan` returns months + packages + agent info. Frontend page (`BrochureSchedulePage`) renders a fixed visual template (`BrochureScheduleTemplate`, mirroring `KursShareTemplates` pattern) and uses `snapdom` + `navigator.share` for share/download.

**Tech Stack:** Node.js 20 (Express), Supabase (`umroh_schedules` table), React 18 + TypeScript (Vite), `@zumer/snapdom` (existing dep) for PNG capture, `node:test` for unit tests.

**Spec:** [docs/superpowers/specs/2026-05-07-brosur-jadwal-design.md](../specs/2026-05-07-brosur-jadwal-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/brochure-schedule.js` | **Create** | Pure helpers: `pickBrochurePrice`, `groupPackagesByMonth`. Server-side only. |
| `tests/brochure-schedule.test.js` | **Create** | `node:test` unit tests for the helpers. |
| `server.js` | **Modify** | Add `GET /api/ai-tools/brosur-jadwal-bulan` endpoint. |
| `src/components/BrochureScheduleTemplate.tsx` | **Create** | React component for the 1080×1920 visual template. Inline formatters (`formatHargaJt`, `formatTglID`, `formatPhoneDisplay`). |
| `src/components/BrochureSchedulePage.tsx` | **Create** | Page: month tabs, fetch endpoint, render template, Share/Download buttons. |
| `src/components/AIToolsPage.tsx` | **Modify** | Add "Brosur Jadwal" card to TOOLS array. |
| `src/components/DashboardLayout.tsx` | **Modify** | Add `if (sub === 'brosur-jadwal') return <BrochureSchedulePage … />`, plus document title mapping. |

---

## Task 1: Pure helper — `pickBrochurePrice`

`pickBrochurePrice(paket_harga)` resolves the single brochure price from `umroh_schedules.paket_harga` JSONB. Logic: per hotel tier, prefer `Quard` → `Triple` → `Double` (skip `Infant`, that's per-baby surcharge). Across hotel tiers, return the **minimum**. Return `null` if no positive price.

**Files:**
- Create: `lib/brochure-schedule.js`
- Create: `tests/brochure-schedule.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/brochure-schedule.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBrochurePrice } from '../lib/brochure-schedule.js';

test('pickBrochurePrice: single hotel tier with Quard', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 33900000, Triple: 35000000, Double: 38000000, Infant: 5000000 } };
  assert.equal(pickBrochurePrice(harga), 33900000);
});

test('pickBrochurePrice: multiple hotel tiers picks min Quard', () => {
  const harga = {
    'Hotel Bintang 5': { Quard: 38000000, Triple: 40000000 },
    'Hotel Bintang 4': { Quard: 33900000, Triple: 35500000 },
  };
  assert.equal(pickBrochurePrice(harga), 33900000);
});

test('pickBrochurePrice: no Quard, falls back to Triple', () => {
  const harga = { 'Hotel Bintang 5': { Triple: 35000000, Double: 38000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});

test('pickBrochurePrice: Quard=0 treated as missing, falls back to Triple', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 0, Triple: 35000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});

test('pickBrochurePrice: skips Infant entirely', () => {
  const harga = { 'Hotel Bintang 5': { Infant: 5000000 } };
  assert.equal(pickBrochurePrice(harga), null);
});

test('pickBrochurePrice: null/undefined input returns null', () => {
  assert.equal(pickBrochurePrice(null), null);
  assert.equal(pickBrochurePrice(undefined), null);
  assert.equal(pickBrochurePrice({}), null);
});

test('pickBrochurePrice: non-numeric string price ignored', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 'tba', Triple: 35000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/brochure-schedule.test.js`
Expected: FAIL with `Cannot find module '../lib/brochure-schedule.js'` or "pickBrochurePrice is not a function".

- [ ] **Step 3: Write minimal implementation**

```js
// lib/brochure-schedule.js

const ROOM_PRIORITY = ['Quard', 'Triple', 'Double']; // Infant intentionally excluded

function tierPrice(tier) {
  if (!tier || typeof tier !== 'object') return null;
  for (const room of ROOM_PRIORITY) {
    const v = Number(tier[room]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

export function pickBrochurePrice(paket_harga) {
  if (!paket_harga || typeof paket_harga !== 'object') return null;
  let min = null;
  for (const tier of Object.values(paket_harga)) {
    const p = tierPrice(tier);
    if (p === null) continue;
    if (min === null || p < min) min = p;
  }
  return min;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/brochure-schedule.test.js`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/brochure-schedule.js tests/brochure-schedule.test.js
git commit -m "feat(brosur): add pickBrochurePrice helper"
```

---

## Task 2: Pure helper — `groupPackagesByMonth`

`groupPackagesByMonth(packages, today, monthsAhead)` filters packages to those with `berangkat_tgl` between `today` (inclusive) and `today + monthsAhead months` (exclusive), groups by `YYYY-MM`, sorts ascending by `berangkat_tgl` within group, drops months with zero packages, returns array of `{key, label, monthIndexId, year, packages, truncatedCount}`. Truncates each month to 10 packages.

**Files:**
- Modify: `lib/brochure-schedule.js`
- Modify: `tests/brochure-schedule.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/brochure-schedule.test.js`:

```js
import { groupPackagesByMonth } from '../lib/brochure-schedule.js';

const today = new Date('2026-05-07T00:00:00.000Z');

test('groupPackagesByMonth: groups by YYYY-MM and sorts asc', () => {
  const rows = [
    { jadwal_id: 'a', jadwal_nama: 'PAKET A', maskapai: 'SAUDIA', berangkat_tgl: '2026-06-20', pulang_tgl: '2026-06-27', price: 33900000 },
    { jadwal_id: 'b', jadwal_nama: 'PAKET B', maskapai: 'EMIRATES', berangkat_tgl: '2026-06-13', pulang_tgl: '2026-06-20', price: 41700000 },
    { jadwal_id: 'c', jadwal_nama: 'PAKET C', maskapai: 'SAUDIA', berangkat_tgl: '2026-07-05', pulang_tgl: '2026-07-12', price: 35000000 },
  ];
  const out = groupPackagesByMonth(rows, today, 24);
  assert.equal(out.length, 2);
  assert.equal(out[0].key, '2026-06');
  assert.equal(out[0].label, 'Juni 2026');
  assert.equal(out[0].monthIndexId, 5);
  assert.equal(out[0].year, 2026);
  assert.equal(out[0].packages.length, 2);
  assert.equal(out[0].packages[0].jadwal_id, 'b'); // sorted asc by berangkat_tgl
  assert.equal(out[0].packages[1].jadwal_id, 'a');
  assert.equal(out[0].truncatedCount, 0);
  assert.equal(out[1].key, '2026-07');
  assert.equal(out[1].packages.length, 1);
});

test('groupPackagesByMonth: filters out past berangkat_tgl', () => {
  const rows = [
    { jadwal_id: 'past', jadwal_nama: 'PAKET LAMA', berangkat_tgl: '2026-05-01' }, // before today 2026-05-07
    { jadwal_id: 'cur', jadwal_nama: 'PAKET INI', berangkat_tgl: '2026-05-15' },
  ];
  const out = groupPackagesByMonth(rows, today, 24);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, '2026-05');
  assert.equal(out[0].packages.length, 1);
  assert.equal(out[0].packages[0].jadwal_id, 'cur');
});

test('groupPackagesByMonth: filters beyond monthsAhead window', () => {
  const rows = [
    { jadwal_id: 'within', berangkat_tgl: '2026-08-01' },
    { jadwal_id: 'beyond', berangkat_tgl: '2027-08-01' },
  ];
  const out = groupPackagesByMonth(rows, today, 6); // only 6 months ahead
  assert.equal(out.length, 1);
  assert.equal(out[0].packages[0].jadwal_id, 'within');
});

test('groupPackagesByMonth: drops months with zero packages', () => {
  const rows = [{ jadwal_id: 'a', berangkat_tgl: '2026-06-13' }];
  const out = groupPackagesByMonth(rows, today, 24);
  // No 2026-05 in result even if today is in May, because no packages match
  assert.equal(out.length, 1);
  assert.equal(out[0].key, '2026-06');
});

test('groupPackagesByMonth: truncates to 10 packages, keeps earliest', () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({
    jadwal_id: `p${i}`,
    berangkat_tgl: `2026-06-${String(i + 1).padStart(2, '0')}`,
  }));
  const out = groupPackagesByMonth(rows, today, 24);
  assert.equal(out[0].packages.length, 10);
  assert.equal(out[0].packages[0].jadwal_id, 'p0');
  assert.equal(out[0].packages[9].jadwal_id, 'p9');
  assert.equal(out[0].truncatedCount, 3);
});

test('groupPackagesByMonth: skips rows with invalid berangkat_tgl', () => {
  const rows = [
    { jadwal_id: 'good', berangkat_tgl: '2026-06-13' },
    { jadwal_id: 'null', berangkat_tgl: null },
    { jadwal_id: 'bad', berangkat_tgl: 'not a date' },
  ];
  const out = groupPackagesByMonth(rows, today, 24);
  assert.equal(out[0].packages.length, 1);
  assert.equal(out[0].packages[0].jadwal_id, 'good');
});

test('groupPackagesByMonth: empty input returns []', () => {
  assert.deepEqual(groupPackagesByMonth([], today, 24), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/brochure-schedule.test.js`
Expected: FAIL with `groupPackagesByMonth is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/brochure-schedule.js`:

```js
const MONTH_LABEL_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const MAX_PACKAGES_PER_MONTH = 10;

function parseISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoMonth(date) {
  // UTC-based formatting so we don't shift across timezones
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function groupPackagesByMonth(packages, today, monthsAhead) {
  if (!Array.isArray(packages) || packages.length === 0) return [];

  const startMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const endDate = new Date(startMs);
  endDate.setUTCMonth(endDate.getUTCMonth() + monthsAhead);
  const endMs = endDate.getTime();

  const groups = new Map(); // key → { key, label, monthIndexId, year, packages: [] }
  for (const pkg of packages) {
    const d = parseISODate(pkg.berangkat_tgl);
    if (!d) continue;
    const ms = d.getTime();
    if (ms < startMs || ms >= endMs) continue;

    const key = isoMonth(d);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: `${MONTH_LABEL_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        monthIndexId: d.getUTCMonth(),
        year: d.getUTCFullYear(),
        packages: [],
        truncatedCount: 0,
      });
    }
    groups.get(key).packages.push(pkg);
  }

  const result = [...groups.values()];
  result.sort((a, b) => a.key.localeCompare(b.key));
  for (const g of result) {
    g.packages.sort((a, b) => String(a.berangkat_tgl).localeCompare(String(b.berangkat_tgl)));
    if (g.packages.length > MAX_PACKAGES_PER_MONTH) {
      g.truncatedCount = g.packages.length - MAX_PACKAGES_PER_MONTH;
      g.packages = g.packages.slice(0, MAX_PACKAGES_PER_MONTH);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/brochure-schedule.test.js`
Expected: PASS — all tests (Task 1 + Task 2) pass.

- [ ] **Step 5: Commit**

```bash
git add lib/brochure-schedule.js tests/brochure-schedule.test.js
git commit -m "feat(brosur): add groupPackagesByMonth helper"
```

---

## Task 3: Endpoint `GET /api/ai-tools/brosur-jadwal-bulan`

Add a new authenticated endpoint that:
1. Reads agent profile (`name`, `phone`, `photo`, `website`) from `agents` table.
2. Reads `umroh_schedules` rows (year_code, jadwal_nama, maskapai, berangkat_tgl, pulang_tgl, paket_harga).
3. Resolves the brochure price per package via `pickBrochurePrice`. Excludes packages with no resolvable price (logs a warning).
4. Groups via `groupPackagesByMonth`.
5. Returns `{ months: [...], agent: {...} }`.

The path `/api/ai-tools/...` is used so it inherits the existing Vite dev proxy entry for `/api/ai-tools` (vite.config.ts) — no proxy config change needed.

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the endpoint near other `/api/ai-tools/*` routes**

Find an existing `/api/ai-tools/*` route in `server.js` to anchor placement, then add this block immediately after one of them. Use the imports at the top of server.js for `supabase` and `authMiddleware`.

```js
import { pickBrochurePrice, groupPackagesByMonth } from './lib/brochure-schedule.js';

// (place this near the top with other imports if not already imported)
```

```js
app.get('/api/ai-tools/brosur-jadwal-bulan', authMiddleware, async (req, res) => {
  try {
    const monthsAhead = Math.max(1, Math.min(36, Number(req.query.monthsAhead) || 24));

    // Agent profile — for personalization in brochure footer
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('name, phone, photo, website')
      .eq('id', req.user.id)
      .maybeSingle();

    if (agentErr) {
      console.error('[brosur-jadwal] agent fetch:', agentErr.message);
      return res.status(500).json({ error: 'Failed to read agent' });
    }

    // Schedules — pull all years (table is small, <300 rows globally)
    const { data: rows, error: schedErr } = await supabase
      .from('umroh_schedules')
      .select('jadwal_id, jadwal_nama, maskapai, berangkat_tgl, pulang_tgl, paket_harga');

    if (schedErr) {
      console.error('[brosur-jadwal] schedule fetch:', schedErr.message);
      return res.status(500).json({ error: 'Failed to read schedules' });
    }

    // Resolve brochure price per row; drop rows with no price
    const priced = [];
    let droppedNoPrice = 0;
    for (const r of (rows || [])) {
      const price = pickBrochurePrice(r.paket_harga);
      if (price === null) {
        droppedNoPrice++;
        continue;
      }
      priced.push({
        id: r.jadwal_id,
        nama: String(r.jadwal_nama || '').toUpperCase(),
        maskapai: String(r.maskapai || '').toUpperCase(),
        berangkat_tgl: r.berangkat_tgl,
        pulang_tgl: r.pulang_tgl,
        harga: price,
      });
    }
    if (droppedNoPrice > 0) {
      console.log(`[brosur-jadwal] dropped ${droppedNoPrice} packages with no resolvable price`);
    }

    const today = new Date();
    const months = groupPackagesByMonth(priced, today, monthsAhead);

    res.json({
      months,
      agent: {
        name: agent?.name || '',
        phone: agent?.phone || '',
        photo: agent?.photo || '',
        website: agent?.website || '',
      },
    });
  } catch (err) {
    console.error('[brosur-jadwal] unexpected:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

- [ ] **Step 2: Verify import is present at top of server.js**

If `pickBrochurePrice`/`groupPackagesByMonth` import line is missing at the top of server.js (where other `lib/*` imports live), add it. Search for an existing `from './lib/` import to find the right grouping.

- [ ] **Step 3: Manual smoke test via curl**

Start the server: `npm start` (in another terminal, run from `/Users/bagas/alhijaz`).

Get a valid JWT (copy from the dashboard browser session: open DevTools → Application → Cookies, copy `token` value, OR use the curl flow already documented for other endpoints). Then:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/ai-tools/brosur-jadwal-bulan | jq '.months[0]'
```

Expected: JSON object with `key`, `label`, `monthIndexId`, `year`, `packages` (array of <=10 objects with `id`/`nama`/`maskapai`/`berangkat_tgl`/`pulang_tgl`/`harga`), `truncatedCount`.

Expected (no auth): `curl -s http://localhost:3000/api/ai-tools/brosur-jadwal-bulan` returns 401.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(brosur): add /api/ai-tools/brosur-jadwal-bulan endpoint"
```

---

## Task 4: Visual template — `BrochureScheduleTemplate.tsx`

Create the React template component that renders the 1080×1920 portrait brochure. Inline formatters (`formatHargaJt`, `formatTglID`, `formatPhoneDisplay`). No data fetching, no events — pure render based on props. Mirrors `KursShareTemplates.tsx` pattern.

**Files:**
- Create: `src/components/BrochureScheduleTemplate.tsx`

- [ ] **Step 1: Create the file with full template**

```tsx
// src/components/BrochureScheduleTemplate.tsx
import { normalizeWaNumber } from '../utils/phone';

export interface BrochurePackage {
  id: string;
  nama: string;
  maskapai: string;
  berangkat_tgl: string; // YYYY-MM-DD
  pulang_tgl: string;
  harga: number;
}

export interface BrochureMonth {
  key: string;
  label: string;
  monthIndexId: number;
  year: number;
  packages: BrochurePackage[];
  truncatedCount: number;
}

export interface BrochureAgent {
  name: string;
  phone: string;
  photo: string;
  website: string;
}

export interface BrochureScheduleTemplateProps {
  month: BrochureMonth;
  agent: BrochureAgent;
}

export const BROCHURE_W = 1080;
export const BROCHURE_H = 1920;

export const BROCHURE_FONT_STACK = "'Inter', 'Inter var', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const BROCHURE_FONT_WEIGHTS = [600, 700, 800, 900] as const;

const MONTH_ABBR_ID = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGT','SEP','OKT','NOV','DES'];

function formatHargaJt(harga: number): string {
  // Round to nearest 100k juta-precision (e.g. 33_950_000 → 34.0, 33_949_999 → 33.9).
  const jt = Math.round(harga / 100_000) / 10;
  return jt.toFixed(1);
}

function formatTglID(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatPhoneDisplay(rawPhone: string): string {
  // normalizeWaNumber returns 62-prefixed digits (e.g. "6282290002").
  // Brochure displays the local 0-prefixed grouping: "0822-9000-20".
  const norm = normalizeWaNumber(rawPhone);
  if (!norm) return '';
  const local = '0' + norm.slice(2); // "62..." → "0..."
  // Group as 4-4-rest (e.g. 0822-9000-20). If shorter, group what we can.
  if (local.length <= 4) return local;
  if (local.length <= 8) return `${local.slice(0, 4)}-${local.slice(4)}`;
  return `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`;
}

function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'A')}&background=8B0000&color=fff&size=192`;
}

function cleanWebsite(website: string): string {
  return (website || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '');
}

export function BrochureScheduleTemplate({ month, agent }: BrochureScheduleTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const website = cleanWebsite(agent.website) || 'alhijazindonesia.com';

  // Row height adapts: 7 rows = 110px, 10 rows = 90px (linear). Cap min 80px.
  const n = month.packages.length;
  const rowH = Math.max(80, Math.round(110 - (n - 7) * 5));

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK,
      background: 'linear-gradient(180deg, #C8102E 0%, #A00020 60%, #8B0000 100%)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header bar */}
      <div style={{
        height: 200,
        padding: '40px 60px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <img
          src="/logo-alhijaz-besar.svg"
          alt="Alhijaz"
          style={{ height: 110, width: 'auto', filter: 'brightness(0) invert(1)' }}
        />
        <div style={{ display: 'flex', gap: 14 }}>
          {/* Two seal-style placeholder badges */}
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            background: '#F8DFA1', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#8B0000', fontWeight: 900, fontSize: 16, textAlign: 'center', lineHeight: 1.05,
            border: '4px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}>SERTI<br/>FIKASI</div>
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#8B0000', fontWeight: 900, fontSize: 14, textAlign: 'center', lineHeight: 1.05,
            border: '4px solid #F8DFA1', boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}>5 PASTI<br/>UMRAH</div>
        </div>
      </div>

      {/* Title block */}
      <div style={{
        padding: '0 60px 30px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          fontSize: 110, fontWeight: 900, lineHeight: 0.95, letterSpacing: -2,
          textShadow: '0 4px 18px rgba(0,0,0,0.35)',
        }}>PAKET UMROH</div>
        <div style={{
          fontSize: 130, fontWeight: 900, lineHeight: 1, letterSpacing: -3, marginTop: 6,
          textShadow: '0 4px 18px rgba(0,0,0,0.35)',
        }}>{month.label.toUpperCase()}</div>
      </div>

      {/* Package table */}
      <div style={{
        margin: '0 50px',
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
        position: 'relative',
        zIndex: 2,
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr 180px 180px 150px 220px',
          background: '#7A0018',
          color: '#fff',
          fontWeight: 900,
          fontSize: 22,
          height: 70,
          alignItems: 'center',
          padding: '0 18px',
          letterSpacing: 1,
        }}>
          <span>NO</span>
          <span>PAKET UMROH</span>
          <span style={{ textAlign: 'center' }}>BERANGKAT</span>
          <span style={{ textAlign: 'center' }}>PULANG</span>
          <span style={{ textAlign: 'center' }}>MASKAPAI</span>
          <span style={{ textAlign: 'right' }}>HARGA</span>
        </div>

        {/* Data rows */}
        {month.packages.map((p, i) => (
          <div key={p.id} style={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr 180px 180px 150px 220px',
            background: '#fff',
            color: '#1f1f1f',
            fontWeight: 700,
            fontSize: 22,
            height: rowH,
            alignItems: 'center',
            padding: '0 18px',
            borderTop: i === 0 ? 'none' : '1px solid #f1d1d6',
          }}>
            <span style={{ color: '#8B0000', fontWeight: 800 }}>{i + 1}.</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{p.nama}</span>
            <span style={{ textAlign: 'center', fontWeight: 800 }}>{formatTglID(p.berangkat_tgl)}</span>
            <span style={{ textAlign: 'center', fontWeight: 800 }}>{formatTglID(p.pulang_tgl)}</span>
            <span style={{ textAlign: 'center' }}>{p.maskapai}</span>
            <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 22, color: '#8B0000', fontWeight: 700 }}>Rp </span>
              <span style={{ fontSize: 36, color: '#8B0000', fontWeight: 900 }}>{formatHargaJt(p.harga)}</span>
              <span style={{ fontSize: 22, color: '#8B0000', fontWeight: 700 }}> Jt</span>
            </span>
          </div>
        ))}

        {/* Truncation footnote */}
        {month.truncatedCount > 0 && (
          <div style={{
            background: '#fff5f5',
            color: '#8B0000',
            fontWeight: 700,
            fontSize: 20,
            padding: '14px 18px',
            textAlign: 'center',
            borderTop: '1px dashed #E5A0AA',
          }}>
            + {month.truncatedCount} paket lainnya — hubungi {agent.name || 'kami'}
          </div>
        )}
      </div>

      {/* Spacer pushes footer down */}
      <div style={{ flex: 1 }} />

      {/* Footer pill — agent info */}
      <div style={{
        margin: '0 50px 24px',
        padding: '24px 28px',
        borderRadius: 28,
        background: 'rgba(60, 0, 5, 0.55)',
        border: '1px solid rgba(248, 223, 161, 0.45)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        zIndex: 2,
      }}>
        <img
          src={photo}
          alt=""
          style={{
            width: 140, height: 140, borderRadius: '50%', objectFit: 'cover',
            border: '5px solid #F8DFA1', flexShrink: 0,
            boxShadow: '0 10px 26px rgba(0,0,0,0.25)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 24, color: '#F8DFA1', fontWeight: 700, letterSpacing: 0.5 }}>
            Info &amp; Pendaftaran:
          </span>
          <strong style={{ fontSize: 44, fontWeight: 900, color: '#fff', marginTop: 2, lineHeight: 1.1 }}>
            {agent.name || 'Alhijaz'} {phone ? `(${phone})` : ''}
          </strong>
        </div>
      </div>

      {/* Website strip */}
      <div style={{
        background: '#5A0010',
        color: '#fff',
        fontWeight: 800,
        fontSize: 30,
        textAlign: 'center',
        padding: '20px 0',
        letterSpacing: 1,
        position: 'relative',
        zIndex: 2,
      }}>
        {website}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

(No standalone smoke test — this template is consumed only by `BrochureSchedulePage`. Visual verification happens in Task 7.)

```bash
git add src/components/BrochureScheduleTemplate.tsx
git commit -m "feat(brosur): add BrochureScheduleTemplate visual component"
```



---

## Task 5: Page component — `BrochureSchedulePage.tsx`

Page that fetches `/api/ai-tools/brosur-jadwal-bulan`, renders a horizontally-scrollable month tab bar, and shows the `BrochureScheduleTemplate` for the selected month. Includes loading state, empty state, and error state. Share/Download buttons added in Task 6.

**Files:**
- Create: `src/components/BrochureSchedulePage.tsx`

- [ ] **Step 1: Create the page (without share/download — those land in Task 6)**

```tsx
// src/components/BrochureSchedulePage.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BrochureScheduleTemplate, BROCHURE_W, BROCHURE_H, type BrochureMonth, type BrochureAgent } from './BrochureScheduleTemplate';
import { getAuthHeaders } from '../utils/auth';

interface BrochureSchedulePageProps {
  agent: BrochureAgent;
}

interface ApiResponse {
  months: BrochureMonth[];
  agent: BrochureAgent;
}

export default function BrochureSchedulePage({ agent: agentProp }: BrochureSchedulePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<BrochureMonth[]>([]);
  const [agent, setAgent] = useState<BrochureAgent>(agentProp);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.4);

  useLayoutEffect(() => {
    function recompute() {
      const w = previewContainerRef.current?.clientWidth || BROCHURE_W;
      setPreviewScale(w / BROCHURE_W);
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/ai-tools/brosur-jadwal-bulan', { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        if (!alive) return;
        setMonths(json.months || []);
        setAgent(json.agent || agentProp);
        if (json.months?.length) {
          // Default to first (= soonest upcoming) — server filters past, sorts asc
          setActiveKey(json.months[0].key);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Gagal memuat brosur');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Scroll active tab into view on change
  useEffect(() => {
    if (!activeKey || !tabBarRef.current) return;
    const el = tabBarRef.current.querySelector(`[data-key="${activeKey}"]`) as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeKey]);

  const activeMonth = months.find(m => m.key === activeKey) || null;

  if (loading) {
    return (
      <div className="px-4 pt-6 pb-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-6 pb-8 text-center text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!months.length || !activeMonth) {
    return (
      <div className="px-4 pt-10 pb-8 text-center">
        <p className="text-sm text-gray-500 dark:text-slate-400">Belum ada jadwal paket yang aktif.</p>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* Tab bar */}
      <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-gray-100 dark:border-slate-800">
        <div ref={tabBarRef} className="overflow-x-auto no-scrollbar">
          <div className="flex gap-2 px-4 py-3 min-w-max">
            {months.map(m => {
              const active = m.key === activeKey;
              return (
                <button
                  key={m.key}
                  data-key={m.key}
                  onClick={() => setActiveKey(m.key)}
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Brochure preview — scaled to fit screen */}
      <div className="flex justify-center px-4 pt-5">
        <div
          ref={previewContainerRef}
          style={{
            width: '100%',
            maxWidth: 480,
            aspectRatio: `${BROCHURE_W} / ${BROCHURE_H}`,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          }}
        >
          <div
            style={{
              width: BROCHURE_W,
              height: BROCHURE_H,
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left',
            }}
          >
            <BrochureScheduleTemplate month={activeMonth} agent={agent} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify `getAuthHeaders` exists in `src/utils/auth.ts`**

Run: `grep -n "getAuthHeaders" src/utils/auth.ts` from the project root.
Expected: at least one match (it's used by other pages like KursPage / HajiPage). If missing, find the auth helper that other pages use and import that one instead.

- [ ] **Step 3: Commit**

```bash
git add src/components/BrochureSchedulePage.tsx
git commit -m "feat(brosur): add BrochureSchedulePage with month tabs"
```

---

## Task 6: Add Share + Download actions

Hidden 1080×1920 export ref captured by `snapdom`, with `navigator.share` (file-aware) and download fallback. Bottom action bar floats above bottom nav.

**Files:**
- Modify: `src/components/BrochureSchedulePage.tsx`

- [ ] **Step 1: Add share/download to the page**

Open `src/components/BrochureSchedulePage.tsx`. Add the following imports at the top (alongside existing imports):

```tsx
import { Download, Share2, Loader2 } from 'lucide-react';
```

Replace the `Loader2` line in the existing imports if it's already there (Task 5 added it) — make sure all 3 icons are present.

Find the `return` block of the success path (the `<div className="pb-32">`), and modify it to include the hidden export node and the action bar:

```tsx
  // ── Add inside the component body (above the existing return) ──
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<null | 'share' | 'download'>(null);

  const filenameForMonth = (label: string) =>
    `brosur-paket-umroh-${label.toLowerCase().replace(/\s+/g, '-')}.png`;

  async function captureBlob(): Promise<Blob | null> {
    if (!exportRef.current) return null;
    const { snapdom } = await import('@zumer/snapdom');
    const result = await snapdom(exportRef.current, { scale: 2, embedFonts: true });
    return await result.toBlob({ type: 'png' });
  }

  async function handleDownload() {
    if (!activeMonth) return;
    setBusy('download');
    try {
      const blob = await captureBlob();
      if (!blob) throw new Error('capture-failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameForMonth(activeMonth.label);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('[brosur] download failed:', e);
      alert('Gagal generate brosur, coba lagi.');
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!activeMonth) return;
    setBusy('share');
    try {
      const blob = await captureBlob();
      if (!blob) throw new Error('capture-failed');
      const file = new File([blob], filenameForMonth(activeMonth.label), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Brosur Paket Umroh ${activeMonth.label}`,
            text: `Paket Umroh ${activeMonth.label} dari ${agent.name || 'Alhijaz'}`,
          });
        } catch (err: any) {
          if (err?.name === 'AbortError') return; // user cancelled — silent
          throw err;
        }
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filenameForMonth(activeMonth.label);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        alert('Browser tidak support share langsung, brosur ter-download.');
      }
    } catch (e) {
      console.error('[brosur] share failed:', e);
      alert('Gagal generate brosur, coba lagi.');
    } finally {
      setBusy(null);
    }
  }
```

Then in the success-path JSX, **after** the brochure preview block (`<div className="flex justify-center px-4 pt-5">…</div>`), append:

```tsx
      {/* Hidden full-size export node — used as snapdom target */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        <div ref={exportRef}>
          <BrochureScheduleTemplate month={activeMonth} agent={agent} />
        </div>
      </div>

      {/* Action bar */}
      <div className="fixed left-0 right-0 bottom-16 px-4 z-20 pointer-events-none">
        <div className="max-w-md mx-auto flex gap-3 pointer-events-auto">
          <button
            onClick={handleShare}
            disabled={busy !== null}
            className="flex-1 h-12 rounded-2xl bg-red-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] disabled:opacity-60"
          >
            {busy === 'share' ? <Loader2 className="animate-spin" size={18} /> : <Share2 size={18} />}
            Share
          </button>
          <button
            onClick={handleDownload}
            disabled={busy !== null}
            className="flex-1 h-12 rounded-2xl bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border-2 border-red-600 dark:border-red-400 font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] disabled:opacity-60"
          >
            {busy === 'download' ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            Download
          </button>
        </div>
      </div>
```

The page's bottom padding `pb-32` already reserves space below the action bar.

- [ ] **Step 2: Commit**

(Visual smoke test for the full feature happens in Task 7 after the route is wired up.)

```bash
git add src/components/BrochureSchedulePage.tsx
git commit -m "feat(brosur): add share and download actions to BrochureSchedulePage"
```

---

## Task 7: Wire up Tools card + DashboardLayout route

Add the "Brosur Jadwal" card to `AIToolsPage`, the route case in `DashboardLayout`, and the document title mapping.

**Files:**
- Modify: `src/components/AIToolsPage.tsx`
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Add card to TOOLS array in AIToolsPage**

In `src/components/AIToolsPage.tsx`, modify the lucide-react import line at the top (line 2) to add `FileImage`:

```tsx
import { Mic, CreditCard, BarChart3, Banknote, ArrowLeftRight, Globe, FileImage } from 'lucide-react';
```

Then in the `TOOLS` array (around line 9), add the new card as the **first entry** (so it appears at the top — most prominent):

```tsx
const TOOLS = [
  {
    id: 'brosur-jadwal',
    name: 'Brosur Jadwal',
    desc: 'Brosur paket umroh per bulan, siap share',
    icon: FileImage,
    color: 'red',
    route: 'brosur-jadwal',
    active: true,
  },
  // … existing entries below
];
```

Add a `red` entry to the `iconStyles` map (around line 66):

```tsx
const iconStyles: Record<string, { bg: string; text: string }> = {
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-600 dark:text-red-400',
  },
  // … existing entries
};
```

- [ ] **Step 2: Add route case in DashboardLayout**

In `src/components/DashboardLayout.tsx`, add the import near the other tool-page imports (search for `import KursPage` or `import ComparePage` to find the right spot):

```tsx
import BrochureSchedulePage from './BrochureSchedulePage';
```

Find the block around line 601-635 (the `activeTab === 'ai-tools'` route handling). Add a new branch BEFORE the `return ( <AIToolsPage … /> )` fallback. Place it next to the other simple-route branches like `if (sub === 'kurs') return <KursPage />;`:

```tsx
            if (sub === 'brosur-jadwal') return <BrochureSchedulePage agent={{
              name: agentData.name,
              phone: agentData.phone,
              photo: agentData.photo || '',
              website: agentData.website || '',
            }} />;
```

Update the document title mapping inside the `onNavigate` callback (around line 628):

```tsx
                  document.title = toolId === 'voice-over' ? 'Voice Over'
                    : toolId === 'business-card' ? 'Kartu Nama'
                    : toolId === 'landing-page' ? 'Landing Page'
                    : toolId === 'haji-plus' ? 'Haji Plus'
                    : toolId === 'kurs' ? 'Kurs Hari Ini'
                    : toolId === 'compare' ? 'Compare'
                    : toolId === 'brosur-jadwal' ? 'Brosur Jadwal'
                    : 'Tools';
```

- [ ] **Step 3: Visual smoke test — full feature path**

In two terminals:
- Terminal 1: `npm start`
- Terminal 2: `npm run dev`

Steps in browser at `http://localhost:5173`:
1. Login as an agent that has a `phone`, `photo`, and `website` populated.
2. Navigate to **Tools**. Verify "Brosur Jadwal" card appears at the top with the FileImage icon and red color.
3. Tap the card. URL should become `/dashboard/ai-tools/brosur-jadwal`. Document title should be "Brosur Jadwal".
4. Verify month tabs render and the first tab (= nearest upcoming month) is selected.
5. Verify the brochure renders with: red gradient bg, "PAKET UMROH" + "{BULAN} {YYYY}" title, header with logo + 2 placeholder badges, package table with correct date format ("13 JUN 2026"), price format ("Rp 33.9 Jt"), footer pill with avatar + name + WA, website strip at bottom.
6. Switch tabs. Brochure rerenders correctly.
7. Tap **Download**. PNG saves with filename `brosur-paket-umroh-juni-2026.png` (or similar).
8. Tap **Share**. On a phone (or Chrome desktop with file share enabled): system share sheet appears with the PNG. On Safari desktop / unsupported environments: PNG downloads + alert "Browser tidak support share langsung…".
9. Test edge case: an agent with NO phone → footer pill shows "Nikita" without `(WA)` parens, no crash.
10. Test edge case: a month with >10 packages → table shows 10 + "+ N paket lainnya — hubungi {agent.name}" footnote row.

If any step fails: stop, fix, repeat the failed step. Common issues:
- `getAuthHeaders` import path differs → check `src/utils/auth.ts` and adjust.
- Snapdom font flicker → ensure all font weights in the template match what's available; existing system fonts should fallback fine.
- Tabs overflow on small screens → already handled by `overflow-x-auto`; verify no layout break.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No new errors. Pre-existing warnings/errors in unrelated files are acceptable but do not introduce new ones from this feature.

- [ ] **Step 5: Run all tests**

Run: `node --test tests/brochure-schedule.test.js`
Expected: PASS for all 14 tests (7 from Task 1 + 7 from Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/components/AIToolsPage.tsx src/components/DashboardLayout.tsx
git commit -m "feat(brosur): wire up Tools card and DashboardLayout route"
```

---

## Task 8: Final verification

End-to-end checklist before declaring done.

- [ ] **Step 1: Verify endpoint via curl one more time**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/ai-tools/brosur-jadwal-bulan | jq '.months | length, .agent.name'
```

Expected: a positive number (months) and a non-empty agent name.

- [ ] **Step 2: Verify all unit tests pass**

```bash
node --test tests/brochure-schedule.test.js
```

Expected: 14/14 pass.

- [ ] **Step 3: Verify build succeeds**

```bash
npm run build
```

Expected: Vite build completes without errors. PWA bundle generated. No new bundle-size warnings beyond the existing ones.

- [ ] **Step 4: Visual smoke test on real phone (optional but strong)**

Deploy to staging or expose dev server via tunnel, open on actual Android/iOS device:
- Tap Share → native share sheet should appear with the PNG attachment.
- Save to gallery → image is 1080×2160 (`scale: 2 × 1080 = 2160` height-wise via snapdom; verify it's at least 1080×1920 source and crisp).

Mark this step complete only if you tested on a real device, OR explicitly note in the commit message that mobile share was not verified.

- [ ] **Step 5: Final commit (if any cleanup made)**

If steps 1-4 surfaced any small fixes, commit them. Otherwise skip.

---

## Spec Coverage Self-Check

Cross-reference against [the design spec](../specs/2026-05-07-brosur-jadwal-design.md):

| Spec section | Covered by |
|---|---|
| Tools menu integration | Task 7 |
| Tab bar default to current/nearest month | Task 5 (server filters past, returns sorted asc; page picks index 0) |
| Hijriah year handling | N/A — `umroh_schedules` already stores Masehi `berangkat_tgl`, no Hijriah math needed |
| Filter: `berangkat_tgl >= today` | Task 2 + Task 3 |
| Format harga "Rp 33.9 Jt" | Task 4 (`formatHargaJt` in template) |
| Source: harga publish kantor (min Quard across hotel tiers) | Task 1 (`pickBrochurePrice`) |
| Aspect ratio 1080×1920 portrait | Task 4 (constants `BROCHURE_W`/`BROCHURE_H`) |
| Footer: photo + name + WA pill + website strip | Task 4 |
| Share via Web Share API + download fallback | Task 6 |
| Bulan range: only months with packages | Task 2 (drops empty-group months) + Task 3 |
| Edge case: no packages at all | Task 5 (empty state) |
| Edge case: >10 packages truncation | Task 2 + Task 4 (footnote) |
| Edge case: agent photo missing | Task 4 (`avatarFallback`) |
| Edge case: website missing | Task 4 (default "alhijazindonesia.com") |
| Edge case: phone missing | Task 4 (renders without parens) |
| Edge case: snapdom failure | Task 6 (catch + alert) |
| Edge case: Web Share AbortError | Task 6 (silent on AbortError) |
| Loading state | Task 5 |
| Tab overflow | Task 5 (`overflow-x-auto` + scrollIntoView) |
| Phone normalization via `normalizeWaNumber` | Task 4 (used in `formatPhoneDisplay`) |
| Anti-pattern: no inline phone regex | Task 4 (uses helper) |
| Anti-pattern: no new sync paths | Confirmed — endpoint reads only |
| Unit tests for helpers | Tasks 1, 2 (14 tests total) |

All spec requirements have a corresponding task. No gaps.
