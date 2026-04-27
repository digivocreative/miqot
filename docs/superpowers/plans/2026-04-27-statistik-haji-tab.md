# Statistik Haji Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Haji tab to `StatistikPage` with USD commission tracking ($200 stage on CICILAN + $300 stage on LUNAS), masehi year filter, and breakdown per departure year. Tab Tren Daftar stays admin-only; Umroh + Haji visible to all roles.

**Architecture:** Extract Haji stats aggregation into a pure function (`lib/haji-stats.js`) so the math is unit-testable in isolation. Extend the existing `/api/haji/stats` Express handler (in `server.js`) to call the pure function and accept a year filter. On the frontend, add a lazy-loaded `StatistikHajiSection.tsx` (mirroring the existing `TrenDaftarSection.tsx` pattern), and refactor `StatistikPage.tsx` shell to manage three tabs and per-tab year state (hijriah for Umroh/Tren, masehi for Haji).

**Tech Stack:** Node.js (Express, Supabase JS), `node:test` for unit tests, React 18 + TypeScript, Recharts, Tailwind, Lucide icons.

**Spec:** [docs/superpowers/specs/2026-04-27-statistik-haji-tab-design.md](../specs/2026-04-27-statistik-haji-tab-design.md)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/haji-stats.js` | **NEW** | Pure functions: `computeKomisi(rows)`, `computeBreakdownTahun(rows)`, `computeAvailableYears(rows)`. No Supabase, no I/O. |
| `tests/haji-stats.test.js` | **NEW** | Unit tests for `lib/haji-stats.js`. |
| `server.js` | MODIFY | Extend `/api/haji/stats` (~lines 8467–8531): import pure functions, add `?year` filter, expand response shape. |
| `src/components/StatistikHajiSection.tsx` | **NEW** | Self-contained tab content: fetch `/api/haji/stats`, render headline cards / komisi card / breakdown chart / footer. |
| `src/components/StatistikPage.tsx` | MODIFY | Tab type rename `'ringkasan'\|'tren'` → `'umroh'\|'haji'\|'tren'`; split year state into hijriah/masehi; render haji section conditional on tab. |
| `src/components/DashboardLayout.tsx` | MODIFY | `getStatistikTabFromPath()` recognize `/haji` segment. |

---

## Task 1: Pure helper for Haji komisi calculation

**Files:**
- Create: `lib/haji-stats.js`
- Test: `tests/haji-stats.test.js`

The komisi math has enough branches (4 status values × 2 stages) that a pure function with focused tests is much easier to verify than testing through the Express handler. Other helpers (breakdown per tahun, available years) live alongside.

- [ ] **Step 1.1: Write the failing tests**

Create `tests/haji-stats.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KOMISI_RATE,
  KOMISI_STAGE1,
  KOMISI_STAGE2,
  computeKomisi,
  computeBreakdownTahun,
  computeAvailableYears,
} from '../lib/haji-stats.js';

test('constants: rate=500, stage1=200, stage2=300', () => {
  assert.equal(KOMISI_RATE, 500);
  assert.equal(KOMISI_STAGE1, 200);
  assert.equal(KOMISI_STAGE2, 300);
  assert.equal(KOMISI_STAGE1 + KOMISI_STAGE2, KOMISI_RATE);
});

test('computeKomisi: empty array returns zeros', () => {
  const k = computeKomisi([]);
  assert.deepEqual(k, {
    totalKomisi: 0,
    sudahCair: 0, sudahCairCount: 0,
    belumCair: 0, belumCairCount: 0,
    potensi: 0, potensiCount: 0,
  });
});

test('computeKomisi: LUNAS jamaah pays full $500 cair', () => {
  const k = computeKomisi([{ status_bayar: 'LUNAS' }]);
  assert.equal(k.sudahCair, 500);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 0);
  assert.equal(k.potensi, 0);
});

test('computeKomisi: LEBIH BAYAR treated as LUNAS', () => {
  const k = computeKomisi([{ status_bayar: 'LEBIH BAYAR' }]);
  assert.equal(k.sudahCair, 500);
  assert.equal(k.sudahCairCount, 1);
});

test('computeKomisi: CICILAN pays $200 cair, $300 belum cair', () => {
  const k = computeKomisi([{ status_bayar: 'CICILAN' }]);
  assert.equal(k.sudahCair, 200);
  assert.equal(k.sudahCairCount, 1);
  assert.equal(k.belumCair, 300);
  assert.equal(k.belumCairCount, 1);
  assert.equal(k.potensi, 0);
});

test('computeKomisi: BELUM BAYAR is potensi $500', () => {
  const k = computeKomisi([{ status_bayar: 'BELUM BAYAR' }]);
  assert.equal(k.sudahCair, 0);
  assert.equal(k.belumCair, 0);
  assert.equal(k.potensi, 500);
  assert.equal(k.potensiCount, 1);
});

test('computeKomisi: null/unknown status_bayar treated as BELUM BAYAR', () => {
  const k = computeKomisi([
    { status_bayar: null },
    { status_bayar: '' },
    { status_bayar: 'WEIRD_VALUE' },
  ]);
  assert.equal(k.potensi, 1500);
  assert.equal(k.potensiCount, 3);
  assert.equal(k.sudahCair, 0);
});

test('computeKomisi: case-insensitive matching', () => {
  const k = computeKomisi([
    { status_bayar: 'lunas' },
    { status_bayar: 'Cicilan' },
    { status_bayar: 'belum bayar' },
  ]);
  assert.equal(k.sudahCair, 500 + 200);
  assert.equal(k.belumCair, 300);
  assert.equal(k.potensi, 500);
});

test('computeKomisi: mixed scenario (5 LUNAS, 3 CICILAN, 2 BELUM, 1 LEBIH BAYAR)', () => {
  const rows = [
    ...Array(5).fill({ status_bayar: 'LUNAS' }),
    ...Array(3).fill({ status_bayar: 'CICILAN' }),
    ...Array(2).fill({ status_bayar: 'BELUM BAYAR' }),
    { status_bayar: 'LEBIH BAYAR' },
  ];
  const k = computeKomisi(rows);
  // sudahCair: (5+1) × 500 + 3 × 200 = 3000 + 600 = 3600
  assert.equal(k.sudahCair, 3600);
  assert.equal(k.sudahCairCount, 9); // 5 LUNAS + 3 CICILAN + 1 LEBIH = 9
  // belumCair: 3 × 300 = 900
  assert.equal(k.belumCair, 900);
  assert.equal(k.belumCairCount, 3);
  // potensi: 2 × 500 = 1000
  assert.equal(k.potensi, 1000);
  assert.equal(k.potensiCount, 2);
  // totalKomisi: 11 × 500 = 5500
  assert.equal(k.totalKomisi, 5500);
  // Sanity: sudahCair + belumCair + potensi == totalKomisi
  assert.equal(k.sudahCair + k.belumCair + k.potensi, k.totalKomisi);
});

test('computeBreakdownTahun: empty array returns empty', () => {
  assert.deepEqual(computeBreakdownTahun([]), []);
});

test('computeBreakdownTahun: groups by thn_masehi, sorted ASC', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
    { thn_masehi: '2027', status_bayar: 'CICILAN' },
    { thn_masehi: '2026', status_bayar: 'BELUM BAYAR' },
    { thn_masehi: '2028', status_bayar: 'LEBIH BAYAR' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b.length, 3);
  assert.equal(b[0].tahun, '2026');
  assert.equal(b[1].tahun, '2027');
  assert.equal(b[2].tahun, '2028');
});

test('computeBreakdownTahun: per-year counts and komisi', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
    { thn_masehi: '2027', status_bayar: 'CICILAN' },
    { thn_masehi: '2027', status_bayar: 'BELUM BAYAR' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b.length, 1);
  assert.equal(b[0].tahun, '2027');
  assert.equal(b[0].total, 4);
  assert.equal(b[0].lunas, 2);
  assert.equal(b[0].cicilan, 1);
  assert.equal(b[0].belumBayar, 1);
  // komisiCair = 2×500 + 1×200 = 1200
  assert.equal(b[0].komisiCair, 1200);
  // komisiTotal = 4 × 500 = 2000
  assert.equal(b[0].komisiTotal, 2000);
});

test('computeBreakdownTahun: LEBIH BAYAR counted as lunas', () => {
  const rows = [
    { thn_masehi: '2027', status_bayar: 'LEBIH BAYAR' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b[0].lunas, 1);
  assert.equal(b[0].cicilan, 0);
  assert.equal(b[0].belumBayar, 0);
  assert.equal(b[0].komisiCair, 500);
});

test('computeBreakdownTahun: rows with null/invalid thn_masehi excluded', () => {
  const rows = [
    { thn_masehi: null, status_bayar: 'LUNAS' },
    { thn_masehi: '', status_bayar: 'LUNAS' },
    { thn_masehi: 'abc', status_bayar: 'LUNAS' },
    { thn_masehi: '2027', status_bayar: 'LUNAS' },
  ];
  const b = computeBreakdownTahun(rows);
  assert.equal(b.length, 1);
  assert.equal(b[0].tahun, '2027');
});

test('computeAvailableYears: dedupe + sort DESC + filter invalid', () => {
  const rows = [
    { thn_masehi: '2027' },
    { thn_masehi: '2027' },
    { thn_masehi: '2026' },
    { thn_masehi: '2030' },
    { thn_masehi: null },
    { thn_masehi: 'abc' },
    { thn_masehi: '' },
  ];
  assert.deepEqual(computeAvailableYears(rows), ['2030', '2027', '2026']);
});

test('computeAvailableYears: empty returns empty array', () => {
  assert.deepEqual(computeAvailableYears([]), []);
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `node --test tests/haji-stats.test.js`
Expected: FAIL — "Cannot find module '../lib/haji-stats.js'"

- [ ] **Step 1.3: Implement `lib/haji-stats.js`**

Create `lib/haji-stats.js`:

```js
/**
 * Pure helpers for Haji stats aggregation.
 *
 * Komisi haji = $500 USD per jamaah, paid in two stages:
 *   - $200 cair when status_bayar becomes CICILAN
 *   - $300 cair when status_bayar becomes LUNAS
 *
 * Status mapping:
 *   LUNAS / LEBIH BAYAR  → fully cair ($500)
 *   CICILAN              → $200 cair, $300 belum cair
 *   BELUM BAYAR / null   → $500 potensi
 */

export const KOMISI_RATE = 500;
export const KOMISI_STAGE1 = 200;  // cair on CICILAN
export const KOMISI_STAGE2 = 300;  // cair on LUNAS

const norm = (s) => (s || '').toString().toUpperCase().trim();

/**
 * @param {Array<{status_bayar: string|null}>} rows
 * @returns {{
 *   totalKomisi: number,
 *   sudahCair: number, sudahCairCount: number,
 *   belumCair: number, belumCairCount: number,
 *   potensi: number, potensiCount: number,
 * }}
 */
export function computeKomisi(rows) {
  let sudahCair = 0, sudahCairCount = 0;
  let belumCair = 0, belumCairCount = 0;
  let potensi = 0, potensiCount = 0;

  for (const r of rows) {
    const s = norm(r.status_bayar);
    if (s === 'LUNAS' || s === 'LEBIH BAYAR') {
      sudahCair += KOMISI_RATE;
      sudahCairCount++;
    } else if (s === 'CICILAN') {
      sudahCair += KOMISI_STAGE1;
      sudahCairCount++;
      belumCair += KOMISI_STAGE2;
      belumCairCount++;
    } else {
      potensi += KOMISI_RATE;
      potensiCount++;
    }
  }

  return {
    totalKomisi: sudahCair + belumCair + potensi,
    sudahCair, sudahCairCount,
    belumCair, belumCairCount,
    potensi, potensiCount,
  };
}

const isValidYear = (y) => typeof y === 'string' && /^\d{4}$/.test(y);

/**
 * @param {Array<{thn_masehi: string|null, status_bayar: string|null}>} rows
 * @returns {Array<{
 *   tahun: string, total: number,
 *   lunas: number, cicilan: number, belumBayar: number,
 *   komisiCair: number, komisiTotal: number
 * }>}
 */
export function computeBreakdownTahun(rows) {
  const map = new Map();
  for (const r of rows) {
    const tahun = r.thn_masehi;
    if (!isValidYear(tahun)) continue;
    if (!map.has(tahun)) {
      map.set(tahun, { tahun, total: 0, lunas: 0, cicilan: 0, belumBayar: 0, komisiCair: 0, komisiTotal: 0 });
    }
    const entry = map.get(tahun);
    entry.total++;
    entry.komisiTotal += KOMISI_RATE;

    const s = norm(r.status_bayar);
    if (s === 'LUNAS' || s === 'LEBIH BAYAR') {
      entry.lunas++;
      entry.komisiCair += KOMISI_RATE;
    } else if (s === 'CICILAN') {
      entry.cicilan++;
      entry.komisiCair += KOMISI_STAGE1;
    } else {
      entry.belumBayar++;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.tahun.localeCompare(b.tahun));
}

/**
 * @param {Array<{thn_masehi: string|null}>} rows
 * @returns {string[]} unique masehi years, sorted DESC
 */
export function computeAvailableYears(rows) {
  const set = new Set();
  for (const r of rows) {
    if (isValidYear(r.thn_masehi)) set.add(r.thn_masehi);
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `node --test tests/haji-stats.test.js`
Expected: All tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add lib/haji-stats.js tests/haji-stats.test.js
git commit -m "feat(haji-stats): pure helpers for komisi USD + breakdown tahun"
```

---

## Task 2: Extend `/api/haji/stats` with year filter, komisi, and breakdown

**Files:**
- Modify: `server.js:8467-8531` (the `/api/haji/stats` handler)

The pure functions from Task 1 do the math; this task wires them into the existing Express handler and adds the `?year` query filter. Existing response fields stay intact for backward compat.

- [ ] **Step 2.1: Add import for haji-stats helpers**

In `server.js`, find the existing import for `haji-api.js` (around line 20):

```js
import { fetchHajiList, fetchHajiDetail, syncHajiData } from './haji-api.js';
```

Add a new import line directly below it:

```js
import { computeKomisi, computeBreakdownTahun, computeAvailableYears } from './lib/haji-stats.js';
```

- [ ] **Step 2.2: Replace the entire `/api/haji/stats` handler**

Locate the handler at `server.js:8467-8531` (look for `app.get('/api/haji/stats'`). Replace the whole `app.get('/api/haji/stats', ...)` block with:

```js
// GET /api/haji/stats — aggregated haji statistics
// Query: ?year=YYYY (masehi). Default: latest available masehi year.
app.get('/api/haji/stats', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;

    // Always-unfiltered: availableYears (dropdown source) + lastSync.
    const [{ data: yearsData, error: yearsErr }, { data: agentRow }] = await Promise.all([
      supabase
        .from('jamaah_haji')
        .select('thn_masehi')
        .eq('agent_id', agentId)
        .not('thn_masehi', 'is', null),
      supabase
        .from('agents')
        .select('last_jamaah_haji_sync_at')
        .eq('id', agentId)
        .maybeSingle(),
    ]);
    if (yearsErr) throw yearsErr;

    const availableYears = computeAvailableYears(yearsData || []);

    // Default to latest masehi year if no year query param.
    let year = req.query.year || null;
    if (!year && availableYears.length > 0) {
      year = availableYears[0];
    }

    // Filtered fetch for all aggregates.
    let q = supabase
      .from('jamaah_haji')
      .select('id_haji, thn_hijriyah, thn_masehi, status_bayar, jenis, paket')
      .eq('agent_id', agentId);
    if (year) q = q.eq('thn_masehi', year);

    const { data, error } = await q;
    if (error) throw error;

    const total = data.length;
    const uniqueHaji = [...new Set(data.map(d => d.id_haji))].length;
    const lunas = data.filter(d => (d.status_bayar || '').toUpperCase() === 'LUNAS').length;
    const cicilan = data.filter(d => (d.status_bayar || '').toUpperCase() === 'CICILAN').length;
    const belumBayar = data.filter(d => (d.status_bayar || '').toUpperCase() === 'BELUM BAYAR').length;
    const lebihBayar = data.filter(d => (d.status_bayar || '').toUpperCase() === 'LEBIH BAYAR').length;

    // % Pelunasan = (LUNAS + LEBIH BAYAR) / total
    const lunasPercent = total > 0 ? Math.round(((lunas + lebihBayar) / total) * 100) : 0;

    // Group by thn_masehi (existing field, kept for backward compat)
    const byTahun = {};
    data.forEach(d => {
      const key = d.thn_masehi || 'unknown';
      byTahun[key] = (byTahun[key] || 0) + 1;
    });

    // Group by jenis (existing field, kept for backward compat)
    const byJenis = {};
    data.forEach(d => {
      const key = d.jenis || 'unknown';
      byJenis[key] = (byJenis[key] || 0) + 1;
    });

    // Komisi USD aggregates + breakdown
    const komisiBase = computeKomisi(data);
    const breakdownTahun = computeBreakdownTahun(data);

    res.json({
      success: true,
      data: {
        // existing fields
        total,
        uniqueHaji,
        lunas,
        cicilan,
        belumBayar,
        byTahun,
        byJenis,
        lastSync: agentRow?.last_jamaah_haji_sync_at || null,

        // new fields
        availableYears,
        masehiYear: year || null,
        lebihBayar,
        lunasPercent,
        komisi: {
          rate: 500,
          stage1: 200,
          stage2: 300,
          ...komisiBase,
          breakdownTahun,
        },
      },
    });
  } catch (err) {
    console.error('[haji] Stats error:', err);
    res.status(500).json({ error: 'Gagal mengambil statistik haji' });
  }
});
```

- [ ] **Step 2.3: Verify server boots**

Run: `node -c server.js`
Expected: No syntax errors (exit 0, no output).

- [ ] **Step 2.4: Manual smoke-test the endpoint**

Start the dev server:

```bash
npm run start &
SERVER_PID=$!
sleep 3
```

Smoke test (substitute `<token>` with a valid JWT from your local browser session — use DevTools → Application → Cookies, or grab from existing localStorage `auth_token`):

```bash
curl -s 'http://localhost:3000/api/haji/stats' -H 'Authorization: Bearer <token>' | python3 -m json.tool | head -40
curl -s 'http://localhost:3000/api/haji/stats?year=2027' -H 'Authorization: Bearer <token>' | python3 -m json.tool | head -40
```

Expected: Response includes `availableYears`, `masehiYear`, `lebihBayar`, `lunasPercent`, and `komisi` object with `rate`, `stage1`, `stage2`, `sudahCair`, `belumCair`, `potensi`, `breakdownTahun`. Year-filtered call returns smaller `total`.

Stop the dev server:

```bash
kill $SERVER_PID 2>/dev/null
```

- [ ] **Step 2.5: Commit**

```bash
git add server.js
git commit -m "feat(haji-stats): year filter + komisi USD + breakdown tahun"
```

---

## Task 3: Create `StatistikHajiSection.tsx` shell + headline cards

**Files:**
- Create: `src/components/StatistikHajiSection.tsx`

This task lays down the file skeleton: types, fetch logic, skeleton state, error state, empty state, and the 4 headline cards. Komisi card and breakdown chart come in Task 4.

- [ ] **Step 3.1: Create `src/components/StatistikHajiSection.tsx`**

Create the file with this content:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Users, Wallet, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

// ── Types ──
export interface HajiStatsData {
  total: number;
  uniqueHaji: number;
  lunas: number;
  cicilan: number;
  belumBayar: number;
  lebihBayar: number;
  lunasPercent: number;
  availableYears: string[];
  masehiYear: string | null;
  lastSync: string | null;
  komisi: {
    rate: number;
    stage1: number;
    stage2: number;
    totalKomisi: number;
    sudahCair: number;
    sudahCairCount: number;
    belumCair: number;
    belumCairCount: number;
    potensi: number;
    potensiCount: number;
    breakdownTahun: Array<{
      tahun: string;
      total: number;
      lunas: number;
      cicilan: number;
      belumBayar: number;
      komisiCair: number;
      komisiTotal: number;
    }>;
  };
}

// ── Formatters ──
function fmtUSD(n: number): string {
  if (!n) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return `$${n.toLocaleString('en-US')}`;
}

function fmtUSDFull(n: number): string {
  return `$${(n || 0).toLocaleString('en-US')}`;
}

function fmtSync(d: string | null): string {
  if (!d) return '-';
  try {
    const date = new Date(d);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ', ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
  } catch { return d; }
}

// ── Skeleton ──
function HajiSkeleton() {
  const pulse = 'bg-gray-200 dark:bg-slate-700 animate-pulse';
  const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm';
  return (
    <div className="px-4 pt-4 pb-8 space-y-3 max-w-lg mx-auto">
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`${card} p-3.5`}>
            <div className={`w-8 h-8 rounded-lg ${pulse}`} />
            <div className={`h-7 w-16 rounded-md ${pulse} mt-3`} />
            <div className={`h-3 w-24 rounded-md ${pulse} mt-2`} />
          </div>
        ))}
      </div>
      <div className={`${card} p-4 h-48`} />
      <div className={`${card} p-4 h-48`} />
    </div>
  );
}

// ── Component ──
interface Props {
  selectedYear: string;
  onYearsLoaded?: (years: string[]) => void;
}

export default function StatistikHajiSection({ selectedYear, onYearsLoaded }: Props) {
  const [data, setData] = useState<HajiStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onYearsLoadedRef = useRef(onYearsLoaded);
  onYearsLoadedRef.current = onYearsLoaded;

  const fetchStats = useCallback(async (year?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      const yr = year !== undefined ? year : selectedYear;
      if (yr) params.set('year', yr);
      const res = await fetch(`/api/haji/stats?${params}`, { headers: { ...getAuthHeaders() } });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        onYearsLoadedRef.current?.(json.data.availableYears || []);
      } else {
        setError(json.error || 'Gagal memuat statistik haji');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setLoading(false);
  }, [selectedYear]);

  useEffect(() => { fetchStats(selectedYear); }, [selectedYear, fetchStats]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/haji/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      const result = await res.json();
      if (!result.success) { setSyncing(false); return; }

      if (pollRef.current) clearInterval(pollRef.current);
      const pollStart = Date.now();
      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStart > 5 * 60 * 1000) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setSyncing(false);
          fetchStats(selectedYear);
          return;
        }
        try {
          const sr = await fetch('/api/haji/sync-status', {
            headers: { ...getAuthHeaders() },
            signal: AbortSignal.timeout(10000),
          });
          const st = await sr.json();
          if (st.success && !st.data.isSyncing) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSyncing(false);
            fetchStats(selectedYear);
          }
        } catch { /* ignore single failure, keep polling */ }
      }, 3000);
    } catch { setSyncing(false); }
  };

  if (loading && !data) return <HajiSkeleton />;

  if (error && !data) {
    return (
      <div className="px-4 pt-6">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-3">{error}</p>
          <button onClick={() => fetchStats(selectedYear)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 text-white shadow-md shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isEmpty = data.total === 0 && !data.lastSync;
  const isEmptyForYear = data.total === 0 && !!data.lastSync;
  const belumLunasCount = data.cicilan + data.belumBayar;

  if (isEmpty) {
    return (
      <div className="px-4 pt-10 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
          <Users size={28} className="text-gray-300 dark:text-slate-600" />
        </div>
        <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">Belum ada data jamaah haji</p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Sync di halaman Haji dulu.</p>
      </div>
    );
  }

  return (
    <div className={`px-4 pt-4 pb-8 space-y-3 max-w-lg mx-auto transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>

      {isEmptyForYear ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-slate-400">Belum ada jamaah haji untuk tahun ini.</p>
        </div>
      ) : (
        <>
          {/* ── Headline 4 cards ── */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Total Jamaah */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40 mb-2">
                <Users size={16} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{data.total}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Total Jamaah</p>
            </div>

            {/* Komisi Cair */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40 mb-2">
                <Wallet size={16} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtUSD(data.komisi.sudahCair)}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Komisi Cair (USD)</p>
            </div>

            {/* Belum Lunas */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center border border-amber-100 dark:border-amber-800/40 mb-2">
                <Clock size={16} className="text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{belumLunasCount}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Belum Lunas</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">{data.cicilan} cicilan · {data.belumBayar} belum bayar</p>
            </div>

            {/* % Pelunasan */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800/40 mb-2">
                <TrendingUp size={16} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.lunasPercent}%</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">% Pelunasan</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">{data.lunas + data.lebihBayar} dari {data.total} lunas</p>
            </div>
          </div>

          {/* Komisi card + Breakdown chart added in Task 4 */}
        </>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-gray-300 dark:text-slate-500">Data per sync terakhir · {fmtSync(data.lastSync)}</span>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors disabled:opacity-50">
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          <span className={syncing ? 'animate-pulse' : ''}>{syncing ? 'Syncing...' : 'Sync Ulang'}</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: No errors related to the new file. (Pre-existing errors in unrelated files are OK — but new errors must be zero.)

- [ ] **Step 3.3: Commit**

```bash
git add src/components/StatistikHajiSection.tsx
git commit -m "feat(statistik-haji): section shell + headline cards + sync footer"
```

---

## Task 4: Add Komisi card and Breakdown chart to `StatistikHajiSection`

**Files:**
- Modify: `src/components/StatistikHajiSection.tsx`

This task fills in the two big content sections that were left as a placeholder comment in Task 3.

- [ ] **Step 4.1: Add Recharts import and tooltip helper**

Open `src/components/StatistikHajiSection.tsx`. At the top, find the existing lucide imports:

```tsx
import { Loader2, Users, Wallet, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
```

Insert a Recharts import directly below those two lines:

```tsx
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
```

Then, just below the `fmtSync` formatter (still in the helpers section near the top of the file), add a custom tooltip:

```tsx
function BreakdownTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const raw = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-800 shadow-lg border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 dark:text-white">{raw.tahun}</p>
      <p className="text-gray-500 dark:text-slate-400">{raw.total} jamaah</p>
      <p className="text-emerald-600 dark:text-emerald-400 font-semibold">Cair: ${raw.komisiCair.toLocaleString('en-US')}</p>
      <p className="text-gray-400 dark:text-slate-500">Total: ${raw.komisiTotal.toLocaleString('en-US')}</p>
    </div>
  );
}
```

- [ ] **Step 4.2: Replace the placeholder comment with the Komisi card and Breakdown chart**

In `StatistikHajiSection.tsx`, find this exact line:

```tsx
          {/* Komisi card + Breakdown chart added in Task 4 */}
```

Replace that single comment line with:

```tsx
          {/* ── Estimasi Komisi (USD) ── */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Estimasi Komisi (USD)</span>
              <span className="text-[10px] text-gray-400 dark:text-slate-400">{data.total} jamaah · ${data.komisi.rate}/jamaah</span>
            </div>
            <div className="px-4 pb-3">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtUSDFull(data.komisi.totalKomisi)}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 mt-0.5">Total estimasi komisi (USD)</p>
            </div>

            {/* 3-segment bar */}
            <div className="px-4 pb-2">
              <div className="h-3 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden flex">
                {data.komisi.totalKomisi > 0 && (
                  <>
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(data.komisi.sudahCair / data.komisi.totalKomisi) * 100}%` }} />
                    <div className="h-full bg-blue-400 transition-all duration-500" style={{ width: `${(data.komisi.belumCair / data.komisi.totalKomisi) * 100}%` }} />
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="font-medium text-gray-600 dark:text-slate-300">Sudah Cair</span></span>
                <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-blue-400" /><span className="font-medium text-gray-600 dark:text-slate-300">Belum Cair</span></span>
                <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-slate-600" /><span className="font-medium text-gray-600 dark:text-slate-300">Potensi</span></span>
              </div>
            </div>

            {/* Detail rows */}
            <div className="px-4 pb-4 space-y-2">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/40 px-3 py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Sudah Cair <span className="text-[10px] font-normal text-emerald-600/70 dark:text-emerald-400/60 ml-1">({data.komisi.sudahCairCount} jamaah)</span>
                  </span>
                  <p className="text-[9px] text-emerald-500/70 dark:text-emerald-400/50">${data.komisi.stage1} per CICILAN + ${data.komisi.rate} per LUNAS</p>
                </div>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtUSDFull(data.komisi.sudahCair)}</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40 px-3 py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                    Belum Cair <span className="text-[10px] font-normal text-blue-600/70 dark:text-blue-400/60 ml-1">({data.komisi.belumCairCount} jamaah)</span>
                  </span>
                  <p className="text-[9px] text-blue-500/70 dark:text-blue-400/50">${data.komisi.stage2} sisa per CICILAN — cair saat LUNAS</p>
                </div>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{fmtUSDFull(data.komisi.belumCair)}</span>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/40 px-3 py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    Potensi <span className="text-[10px] font-normal text-amber-600/70 dark:text-amber-400/60 ml-1">({data.komisi.potensiCount} jamaah)</span>
                  </span>
                  <p className="text-[9px] text-amber-500/70 dark:text-amber-400/50">Jika BELUM BAYAR melunasi pembayaran</p>
                </div>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{fmtUSDFull(data.komisi.potensi)}</span>
              </div>
            </div>
          </div>

          {/* ── Breakdown per Tahun Keberangkatan ── */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50">
              <p className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Per Tahun Keberangkatan</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">Jumlah jamaah per status, dikelompokkan per tahun masehi</p>
            </div>
            {data.komisi.breakdownTahun.length === 0 ? (
              <div className="px-4 py-8 text-center"><p className="text-xs text-gray-400 dark:text-slate-500">Belum ada data per tahun</p></div>
            ) : (
              <div className="px-2 py-3">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.komisi.breakdownTahun} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="tahun" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<BreakdownTooltip />} cursor={{ fill: 'rgba(16,185,129,0.06)' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                    <Bar dataKey="lunas" stackId="a" fill="#10b981" name="Lunas" radius={[0,0,0,0]} />
                    <Bar dataKey="cicilan" stackId="a" fill="#f59e0b" name="Cicilan" />
                    <Bar dataKey="belumBayar" stackId="a" fill="#ef4444" name="Belum Bayar" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
```

- [ ] **Step 4.3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: No new errors.

- [ ] **Step 4.4: Commit**

```bash
git add src/components/StatistikHajiSection.tsx
git commit -m "feat(statistik-haji): komisi card + breakdown bar chart"
```

---

## Task 5: Refactor `StatistikPage.tsx` — tab type, year state split, render haji section

**Files:**
- Modify: `src/components/StatistikPage.tsx`

This rewires the shell: tab union becomes `'umroh'|'haji'|'tren'`, year state splits into hijriah/masehi, and dropdown content is context-aware.

- [ ] **Step 5.1: Add lazy import for haji section**

Find the existing line (around line 13):

```tsx
const TrenDaftarSection = lazy(() => import('./TrenDaftarSection'));
```

Add directly below it:

```tsx
const StatistikHajiSection = lazy(() => import('./StatistikHajiSection'));
```

- [ ] **Step 5.2: Update component prop type**

Find the component signature (around line 374–379):

```tsx
export default function StatistikPage({ agentSlug, role, onHeaderRight, initialStatTab }: {
  agentSlug: string;
  role?: string;
  onHeaderRight?: (node: React.ReactNode) => void;
  initialStatTab?: 'ringkasan' | 'tren';
}) {
```

Replace the `initialStatTab` type:

```tsx
export default function StatistikPage({ agentSlug, role, onHeaderRight, initialStatTab }: {
  agentSlug: string;
  role?: string;
  onHeaderRight?: (node: React.ReactNode) => void;
  initialStatTab?: 'umroh' | 'haji' | 'tren';
}) {
```

- [ ] **Step 5.3: Update tab state and add masehi state**

Find (around line 381):

```tsx
  const isAdmin = role === 'admin';
  const [statTab, setStatTab] = useState<'ringkasan' | 'tren'>(initialStatTab || 'ringkasan');
```

Replace with:

```tsx
  const isAdmin = role === 'admin';
  const [statTab, setStatTab] = useState<'umroh' | 'haji' | 'tren'>(initialStatTab || 'umroh');
  // Year state split: hijriah for Umroh+Tren, masehi for Haji
  const [selectedYearMasehi, setSelectedYearMasehi] = useState('');
  const [hajiAvailableYears, setHajiAvailableYears] = useState<string[]>([]);
```

- [ ] **Step 5.4: Update header dropdown to be context-aware**

Find the existing header-dropdown effect (around line 586–605, the block starting `// Push year dropdown into header`). Replace the entire block from the line `const dropdownYears = useMemo(...)` up to the closing `}, [data, selectedYear, ...])` with:

```tsx
  // Hijriah years (Umroh + Tren tabs)
  const hijriahDropdownYears = useMemo(() => {
    if (!data) return [];
    const merged = [...new Set([...data.availableYears, ...allYears])];
    return merged.filter(y => Number(y) >= 1447).sort((a, b) => b.localeCompare(a));
  }, [data, allYears]);

  useEffect(() => {
    if (!onHeaderRight) return;

    if (statTab === 'haji') {
      if (hajiAvailableYears.length === 0) { onHeaderRight(null); return; }
      onHeaderRight(
        <select
          value={selectedYearMasehi}
          onChange={e => setSelectedYearMasehi(e.target.value)}
          className="h-8 text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 pr-6 outline-none appearance-none cursor-pointer shrink-0"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
        >
          {hajiAvailableYears.map(y => <option key={y} value={y}>{y} M</option>)}
        </select>
      );
      return;
    }

    // Umroh + Tren tabs use hijriah dropdown
    if (!data || hijriahDropdownYears.length === 0) { onHeaderRight(null); return; }
    onHeaderRight(
      <select
        value={selectedYear}
        onChange={e => setSelectedYear(e.target.value)}
        className="h-8 text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 pr-6 outline-none appearance-none cursor-pointer shrink-0"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
      >
        {hijriahDropdownYears.map(y => <option key={y} value={y}>{y} H</option>)}
      </select>
    );
  }, [statTab, data, selectedYear, selectedYearMasehi, hijriahDropdownYears, hajiAvailableYears, onHeaderRight, syncing, backgroundSyncing]);
```

- [ ] **Step 5.5: Update tab bar (3 tabs, with non-admin seeing 2)**

Find the existing admin tab bar (around line 753–783, the block `{isAdmin && (` up to its closing `)}` for the tab bar div). Replace the whole block with:

```tsx
      {/* ── Tab Bar (Umroh + Haji always; Tren admin-only) ── */}
      <div className="sticky top-[53px] z-20 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700">
        <div className="px-4 py-2">
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
            {([
              { id: 'umroh' as const, label: 'Umroh', Icon: BarChart3 },
              { id: 'haji' as const, label: 'Haji', Icon: Plane },
              ...(isAdmin ? [{ id: 'tren' as const, label: 'Tren Daftar', Icon: TrendingUp }] : []),
            ]).map(tab => {
              const active = statTab === tab.id;
              return (
                <button key={tab.id} onClick={() => {
                  setStatTab(tab.id);
                  window.scrollTo({ top: 0 });
                  const slug = tab.id === 'tren' ? '/dashboard/statistik/tren-daftar'
                    : tab.id === 'haji' ? '/dashboard/statistik/haji'
                    : '/dashboard/statistik';
                  window.history.replaceState({ tab: 'statistik' }, '', slug);
                }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${
                    active ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold' : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'
                  }`}
                  style={active ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}
                >
                  <tab.Icon size={13} strokeWidth={2.2} />
                  <span className="text-[11px]">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
```

- [ ] **Step 5.6: Rename `ringkasan` tab gate to `umroh` and add Haji tab render**

Find this line (around line 786):

```tsx
      {(!isAdmin || statTab === 'ringkasan') && (
```

Replace with:

```tsx
      {statTab === 'umroh' && (
```

Then find the `{isAdmin && statTab === 'tren' && (` block (around line 1051) which contains the `<Suspense>` for `TrenDaftarSection`. Directly **before** that block, insert the Haji tab render:

```tsx
      {/* ── Haji Tab ── */}
      {statTab === 'haji' && (
        <Suspense fallback={
          <div className="px-4 pt-4 pb-8 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />)}
            </div>
            <div className="h-52 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
            <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
          </div>
        }>
          <StatistikHajiSection
            selectedYear={selectedYearMasehi}
            onYearsLoaded={(years) => {
              setHajiAvailableYears(years);
              if (!selectedYearMasehi && years.length > 0) {
                setSelectedYearMasehi(years[0]);
              }
            }}
          />
        </Suspense>
      )}

```

- [ ] **Step 5.7: Add `Plane` icon to lucide imports**

Find the lucide-react import at the top of `StatistikPage.tsx` (line 2–5). The current imports are:

```tsx
import {
  Loader2, Users, Plane, UserPlus, Wallet,
  Check, ChevronDown, X, RefreshCw, BarChart3, TrendingUp, Lock, ArrowLeft,
} from 'lucide-react';
```

`Plane` is already imported — no change needed. (Verify it's there; if not, add it.)

- [ ] **Step 5.8: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: No errors related to `StatistikPage.tsx`.

- [ ] **Step 5.9: Commit**

```bash
git add src/components/StatistikPage.tsx
git commit -m "feat(statistik): add haji + umroh tabs, split year state by tab"
```

---

## Task 6: Update routing in `DashboardLayout.tsx`

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 6.1: Update `getStatistikTabFromPath()`**

Find (around line 85–90):

```tsx
function getStatistikTabFromPath(): 'ringkasan' | 'tren' {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/statistik/tren-daftar
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'statistik' && segments[2] === 'tren-daftar') return 'tren';
  return 'ringkasan';
}
```

Replace with:

```tsx
function getStatistikTabFromPath(): 'umroh' | 'haji' | 'tren' {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'statistik') {
    if (segments[2] === 'haji') return 'haji';
    if (segments[2] === 'tren-daftar') return 'tren';
  }
  return 'umroh';
}
```

- [ ] **Step 6.2: Update consumers of `getStatistikTabFromPath()` (if any TS errors)**

Run: `npx tsc --noEmit -p tsconfig.json`

If errors mention the return type mismatch with `initialStatTab` prop in `<StatistikPage>`, find the call site in `DashboardLayout.tsx` (search for `<StatistikPage`) — the prop type has already been widened in Task 5, so this should compile cleanly. If there is a residual `'ringkasan'` literal anywhere, replace it with `'umroh'`.

Expected: TypeScript compiles cleanly for both `DashboardLayout.tsx` and `StatistikPage.tsx`.

- [ ] **Step 6.3: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat(routing): recognize /dashboard/statistik/haji segment"
```

---

## Task 7: Manual end-to-end verification

**Files:** none (verification only).

This task is a structured walkthrough. No code changes — it confirms the integrated feature works in a browser.

- [ ] **Step 7.1: Build and start the dev server**

```bash
npm run dev &
DEV_PID=$!
sleep 3
echo "Dev server pid: $DEV_PID"
```

Wait until you see `Local:   http://localhost:5173/` (or similar) in the output.

- [ ] **Step 7.2: Admin role smoke test**

In a browser, log in as an admin user, then visit:

1. `/dashboard/statistik` — Verify: 3 tabs visible (Umroh / Haji / Tren Daftar). Umroh content rendered. Year dropdown shows hijriah (`1448 H`).
2. Click **Haji** tab — Verify: URL becomes `/dashboard/statistik/haji`. Year dropdown switches to masehi (`2027 M` etc). Headline 4 cards render: Total Jamaah, Komisi Cair (USD), Belum Lunas, % Pelunasan. Komisi card with 3-segment bar appears. Bar chart per tahun appears.
3. Change masehi year in dropdown — Verify: stats refresh, totals change.
4. Click **Tren Daftar** tab — Verify: URL `/dashboard/statistik/tren-daftar`, content loads, year dropdown back to hijriah.
5. Click **Umroh** tab — Verify: URL `/dashboard/statistik`, dropdown back to hijriah, value preserved from earlier.

- [ ] **Step 7.3: Agent (non-admin) role smoke test**

Log in as a non-admin agent (or impersonate one). Visit `/dashboard/statistik`:

1. Verify: Only **2 tabs** visible (Umroh + Haji). No Tren Daftar.
2. Visit `/dashboard/statistik/tren-daftar` directly — Verify: tab falls back to Umroh (since `tren` is admin-only and tab bar doesn't render the option, `statTab` stays as initialized).
3. Click Haji tab — Verify: stats render, dropdown switches to masehi.

- [ ] **Step 7.4: Komisi calculation sanity check**

Pick a known agent and use DevTools → Network tab to inspect the `/api/haji/stats` response. Verify in the JSON:

- `komisi.totalKomisi === total × 500`
- `komisi.sudahCair + komisi.belumCair + komisi.potensi === komisi.totalKomisi`
- `komisi.sudahCairCount === lunas + lebihBayar + cicilan`
- `komisi.belumCairCount === cicilan`
- `komisi.potensiCount === belumBayar + (any rows with null/unknown status)`

- [ ] **Step 7.5: Empty state check**

If you have access to a fresh agent without haji data, visit Haji tab. Verify: empty state message "Belum ada data jamaah haji. Sync di halaman Haji dulu."

- [ ] **Step 7.6: Sync button**

In Haji tab, click **Sync Ulang** in the footer. Verify:
1. Button text changes to "Syncing..." with spinner.
2. Stats refresh after sync completes (or after timeout).
3. Last sync timestamp updates.

- [ ] **Step 7.7: Stop dev server**

```bash
kill $DEV_PID 2>/dev/null
```

- [ ] **Step 7.8: Final commit (no-op if no changes)**

```bash
git status
# If anything stale appears, investigate. Otherwise no commit needed.
```

---

## Self-Review Checklist (already performed by author)

- ✅ Spec coverage: tab visibility (Task 5), year dropdown context-aware (Task 5.4), backend endpoint extension (Task 2), komisi calc (Task 1+2), all 4 frontend sections (Tasks 3+4), routing (Task 6), edge cases (handled in Task 1 tests + Task 3 empty states).
- ✅ Placeholder scan: no TBD/TODO/"add appropriate error handling" — every step has concrete code or commands.
- ✅ Type consistency: `HajiStatsData` (Task 3) matches the response shape from Task 2's handler. Komisi field names (`sudahCair`, `belumCair`, `potensi`, plus `*Count` variants) consistent across pure function (Task 1), API (Task 2), and frontend (Task 3+4).
- ✅ Tab union `'umroh' | 'haji' | 'tren'` consistent across `StatistikPage.tsx` (Task 5), `DashboardLayout.tsx` (Task 6).
