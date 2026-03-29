# Tren Daftar Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only "Tren Daftar" tab to the Statistik page that shows aggregate registration trends, revenue, demographics, lead time, pelunasan speed, and agent/paket rankings across all agents for a given hijriah year.

**Architecture:** Two new backend endpoints serve aggregated jamaah data (12 parallel Supabase queries). StatistikPage gets a new `role` prop to conditionally render a tab bar. TrenDaftarSection is extracted to its own file (~900 lines) to keep StatistikPage manageable. All charts use Recharts (already installed). Custom heatmaps use CSS grid.

**Tech Stack:** Express.js backend, Supabase (PostgreSQL), React + TypeScript frontend, Recharts, Tailwind CSS, Lucide icons.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `server.js` | Add 2 endpoints: `GET /api/laporan/tren-daftar` and `GET /api/laporan/tren-daftar/years` |
| Modify | `src/components/DashboardLayout.tsx` | Pass `role` prop to StatistikPage |
| Modify | `src/components/StatistikPage.tsx` | Accept `role` prop, add admin-only tab bar, lazy-render TrenDaftarSection |
| Create | `src/components/TrenDaftarSection.tsx` | All 12 sections of the Tren Daftar view |

---

### Task 1: Backend — Years Endpoint

**Files:**
- Modify: `server.js` (insert near line 3345, before existing `/api/laporan/stats`)

- [ ] **Step 1: Add the `/api/laporan/tren-daftar/years` endpoint**

Insert this immediately before the existing `app.get('/api/laporan/stats', ...)` line in `server.js`:

```javascript
// ── Tren Daftar: Available Hijriah Years (Admin only) ──
app.get('/api/laporan/tren-daftar/years', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('jamaah')
      .select('hijriah_year')
      .not('hijriah_year', 'is', null);
    if (error) throw error;
    const years = [...new Set((data || []).map(d => d.hijriah_year))].sort((a, b) => b.localeCompare(a));
    res.json({ success: true, data: years });
  } catch (err) {
    console.error('[TrenDaftar] Years error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data tahun' });
  }
});
```

- [ ] **Step 2: Verify endpoint manually**

Run: `curl -H "Authorization: Bearer <admin-token>" http://localhost:3000/api/laporan/tren-daftar/years`
Expected: `{ "success": true, "data": ["1447", "1446", ...] }`

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add tren-daftar years endpoint (admin only)"
```

---

### Task 2: Backend — Main Tren Daftar Endpoint (Part 1: Summary + Monthly + Heatmap)

**Files:**
- Modify: `server.js` (insert after the years endpoint from Task 1)

- [ ] **Step 1: Add helper constants and the endpoint shell with summary + monthly + heatmap queries**

Insert right after the years endpoint:

```javascript
// ── Tren Daftar: Main Data (Admin only) ──
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

app.get('/api/laporan/tren-daftar', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { hijriahYear } = req.query;
    if (!hijriahYear) return res.status(400).json({ error: 'hijriahYear wajib diisi' });

    const year = String(hijriahYear);
    const prevYear = String(Number(year) - 1);

    // ── Fetch all jamaah for this year + prev year in one query each ──
    const [{ data: rowsCur }, { data: rowsPrev }] = await Promise.all([
      supabase.from('jamaah').select('tgl_daftar, tgl_berangkat, tgl_lahir, jk, bayar, sisa, paket, agent_slug').eq('hijriah_year', year),
      supabase.from('jamaah').select('tgl_daftar').eq('hijriah_year', prevYear),
    ]);

    const cur = rowsCur || [];
    const prev = rowsPrev || [];

    // ── Summary ──
    const totalDaftar = cur.length;
    const totalDaftarPrev = prev.length;
    const growthPct = totalDaftarPrev > 0 ? Math.round(((totalDaftar - totalDaftarPrev) / totalDaftarPrev) * 1000) / 10 : 0;

    // Monthly counts (current year)
    const monthlyCur = new Array(12).fill(0);
    cur.forEach(j => { if (j.tgl_daftar) { const m = new Date(j.tgl_daftar).getMonth(); monthlyCur[m]++; } });

    // Monthly counts (prev year)
    const monthlyPrev = new Array(12).fill(0);
    prev.forEach(j => { if (j.tgl_daftar) { const m = new Date(j.tgl_daftar).getMonth(); monthlyPrev[m]++; } });

    const monthsWithData = monthlyCur.filter(c => c > 0).length || 1;
    const avgPerMonth = Math.round(totalDaftar / monthsWithData);

    let peakIdx = 0, slowIdx = -1, slowVal = Infinity;
    monthlyCur.forEach((c, i) => {
      if (c > monthlyCur[peakIdx]) peakIdx = i;
      if (c > 0 && c < slowVal) { slowVal = c; slowIdx = i; }
    });
    if (slowIdx === -1) slowIdx = 0;

    const summary = {
      totalDaftar, totalDaftarPrev, growthPct, avgPerMonth,
      peakMonth: MONTH_FULL[peakIdx], peakMonthCount: monthlyCur[peakIdx],
      slowestMonth: MONTH_FULL[slowIdx], slowestMonthCount: monthlyCur[slowIdx],
    };

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, label: MONTH_LABELS[i], count: monthlyCur[i], countPrev: monthlyPrev[i],
    }));

    // ── Heatmap (3 years) ──
    const { data: heatYearsRaw } = await supabase
      .from('jamaah').select('hijriah_year').not('hijriah_year', 'is', null);
    const allYears = [...new Set((heatYearsRaw || []).map(d => d.hijriah_year))].sort((a, b) => b.localeCompare(a)).slice(0, 3);

    const heatmap = {};
    // Current year already computed
    heatmap[year] = [...monthlyCur];
    if (allYears.includes(prevYear)) heatmap[prevYear] = [...monthlyPrev];

    // Fetch any additional years not yet fetched
    for (const hy of allYears) {
      if (heatmap[hy]) continue;
      const { data: hyRows } = await supabase.from('jamaah').select('tgl_daftar').eq('hijriah_year', hy);
      const arr = new Array(12).fill(0);
      (hyRows || []).forEach(j => { if (j.tgl_daftar) { arr[new Date(j.tgl_daftar).getMonth()]++; } });
      heatmap[hy] = arr;
    }
    // Ensure 3 entries
    for (const hy of allYears) { if (!heatmap[hy]) heatmap[hy] = new Array(12).fill(0); }

    // (continued in next step — revenue, insights, demographics, distributions, rankings)
    // PLACEHOLDER_CONTINUE
  } catch (err) {
    console.error('[TrenDaftar] Error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data tren' });
  }
});
```

- [ ] **Step 2: Commit partial progress**

```bash
git add server.js
git commit -m "feat(wip): tren-daftar endpoint — summary, monthly, heatmap"
```

---

### Task 3: Backend — Main Tren Daftar Endpoint (Part 2: Revenue + Insights + Demographics)

**Files:**
- Modify: `server.js` (replace `// PLACEHOLDER_CONTINUE` with the rest of the computation)

- [ ] **Step 1: Replace the PLACEHOLDER_CONTINUE comment with revenue, insights, gender, age, and distribution computations**

Replace `// PLACEHOLDER_CONTINUE` with:

```javascript
    // ── Revenue ──
    const revenueMonthly = new Array(12).fill(0);
    let totalMasuk = 0;
    cur.forEach(j => {
      const b = Number(j.bayar) || 0;
      totalMasuk += b;
      if (j.tgl_daftar) { revenueMonthly[new Date(j.tgl_daftar).getMonth()] += b; }
    });
    const revMonthsWithData = revenueMonthly.filter(v => v > 0).length || 1;
    const revenue = {
      totalMasuk,
      avgPerMonth: Math.round(totalMasuk / revMonthsWithData),
      monthly: revenueMonthly.map((total, i) => ({ month: i + 1, label: MONTH_LABELS[i], total })),
    };

    // ── Insights ──
    const withDates = cur.filter(j => j.tgl_daftar && j.tgl_berangkat);
    const leadDays = withDates.map(j => (new Date(j.tgl_berangkat) - new Date(j.tgl_daftar)) / 86400000).filter(d => d > 0);
    const leadTimeAvg = leadDays.length > 0 ? Math.round((leadDays.reduce((s, d) => s + d, 0) / leadDays.length / 30) * 10) / 10 : 0;

    const lunasCount = cur.filter(j => j.sisa === 0 || j.sisa === null).length;
    const conversionRate = totalDaftar > 0 ? Math.round((lunasCount / totalDaftar) * 100) : 0;

    const lunasWithDates = cur.filter(j => (j.sisa === 0 || j.sisa === null) && j.tgl_daftar && j.tgl_berangkat);
    const pelunasanDays = lunasWithDates.map(j => (new Date(j.tgl_berangkat) - new Date(j.tgl_daftar)) / 86400000).filter(d => d > 0);
    const pelunasanAvg = pelunasanDays.length > 0 ? Math.round((pelunasanDays.reduce((s, d) => s + d, 0) / pelunasanDays.length / 30) * 10) / 10 : 0;

    // Top paket (group by first word)
    const paketMap = {};
    cur.forEach(j => { if (j.paket) { const key = j.paket.split(' ')[0].toUpperCase(); paketMap[key] = (paketMap[key] || 0) + 1; } });
    const topPaket = Object.entries(paketMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    const insights = { leadTimeAvg, conversionRate, pelunasanAvg, topPaket };

    // ── Gender ──
    let perempuan = 0, lakiLaki = 0;
    cur.forEach(j => { if (j.jk === 'P') perempuan++; else if (j.jk === 'L') lakiLaki++; });
    const gender = { perempuan, lakiLaki };

    // ── Age Distribution ──
    const now = new Date();
    const ages = cur.filter(j => j.tgl_lahir).map(j => {
      const birth = new Date(j.tgl_lahir);
      return Math.floor((now - birth) / (365.25 * 86400000));
    }).filter(a => a >= 0 && a < 150);

    const ageBuckets = [
      { range: '18-30', min: 18, max: 30, count: 0 },
      { range: '31-40', min: 31, max: 40, count: 0 },
      { range: '41-50', min: 41, max: 50, count: 0 },
      { range: '51-60', min: 51, max: 60, count: 0 },
      { range: '60+', min: 61, max: 999, count: 0 },
    ];
    ages.forEach(a => { for (const b of ageBuckets) { if (a >= b.min && a <= b.max) { b.count++; break; } } });
    const ageTotal = ages.length || 1;
    const ageDistribution = ageBuckets.map(b => ({ range: b.range, count: b.count, pct: Math.round((b.count / ageTotal) * 100) }));
    const ageAvg = ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : 0;

    // ── Lead Time Distribution ──
    const ltBuckets = [
      { range: '< 1 bulan', min: 0, max: 29, count: 0 },
      { range: '1-2 bulan', min: 30, max: 59, count: 0 },
      { range: '2-4 bulan', min: 60, max: 119, count: 0 },
      { range: '4-6 bulan', min: 120, max: 179, count: 0 },
      { range: '> 6 bulan', min: 180, max: 99999, count: 0 },
    ];
    leadDays.forEach(d => { for (const b of ltBuckets) { if (d >= b.min && d <= b.max) { b.count++; break; } } });
    const ltTotal = leadDays.length || 1;
    const leadTimeDistribution = ltBuckets.map(b => ({ range: b.range, pct: Math.round((b.count / ltTotal) * 100) }));

    // ── Pelunasan Distribution ──
    const plBuckets = [
      { range: '< 2 minggu', min: 0, max: 13, count: 0 },
      { range: '2-4 minggu', min: 14, max: 29, count: 0 },
      { range: '1-2 bulan', min: 30, max: 59, count: 0 },
      { range: '2-4 bulan', min: 60, max: 119, count: 0 },
      { range: '> 4 bulan', min: 120, max: 99999, count: 0 },
    ];
    pelunasanDays.forEach(d => { for (const b of plBuckets) { if (d >= b.min && d <= b.max) { b.count++; break; } } });
    const plTotal = pelunasanDays.length || 1;
    const pelunasanDistribution = plBuckets.map(b => ({ range: b.range, pct: Math.round((b.count / plTotal) * 100) }));
    const pelunasanFastPct = pelunasanDistribution.slice(0, 2).reduce((s, b) => s + b.pct, 0);

    // ── Daftar vs Berangkat Matrix ──
    const dvb = Array.from({ length: 12 }, () => new Array(12).fill(0));
    withDates.forEach(j => {
      const dm = new Date(j.tgl_daftar).getMonth();
      const bm = new Date(j.tgl_berangkat).getMonth();
      dvb[dm][bm]++;
    });

    // ── Agent Ranking ──
    const agentMap = {};
    cur.forEach(j => { if (j.agent_slug) agentMap[j.agent_slug] = (agentMap[j.agent_slug] || 0) + 1; });
    const agentSlugs = Object.keys(agentMap);
    const { data: agentRows } = agentSlugs.length > 0
      ? await supabase.from('agents').select('slug, name, photo').in('slug', agentSlugs)
      : { data: [] };
    const agentInfo = Object.fromEntries((agentRows || []).map(a => [a.slug, a]));
    const agentRanking = Object.entries(agentMap)
      .map(([slug, count]) => ({ slug, name: agentInfo[slug]?.name || slug, photo: agentInfo[slug]?.photo || '', count }))
      .sort((a, b) => b.count - a.count);

    // ── Paket Ranking (grouped by first word) ──
    const paketTotal = Object.values(paketMap).reduce((s, c) => s + c, 0) || 1;
    const paketRanking = Object.entries(paketMap)
      .map(([paket, count]) => ({ paket, count, pct: Math.round((count / paketTotal) * 100) }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        period: year, periodPrev: prevYear,
        summary, monthly, heatmap, revenue, insights,
        gender, ageDistribution, ageAvg,
        leadTimeDistribution, pelunasanDistribution, pelunasanFastPct,
        daftarVsBerangkat: dvb, agentRanking, paketRanking,
      },
    });
```

- [ ] **Step 2: Verify endpoint**

Run: `curl -H "Authorization: Bearer <admin-token>" "http://localhost:3000/api/laporan/tren-daftar?hijriahYear=1447" | jq .data.summary`
Expected: JSON with `totalDaftar`, `growthPct`, `peakMonth`, etc.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: complete tren-daftar endpoint — all 12 data sections"
```

---

### Task 4: Frontend — Pass `role` Prop & Add Tab Bar to StatistikPage

**Files:**
- Modify: `src/components/DashboardLayout.tsx:501-502`
- Modify: `src/components/StatistikPage.tsx:371-374, 519`

- [ ] **Step 1: Update DashboardLayout to pass `role` prop**

In `src/components/DashboardLayout.tsx`, change:

```typescript
          {activeTab === 'statistik' && (
            <StatistikPage agentSlug={agentData.slug} onHeaderRight={setStatistikHeaderRight} />
          )}
```

To:

```typescript
          {activeTab === 'statistik' && (
            <StatistikPage agentSlug={agentData.slug} role={agentData.role} onHeaderRight={setStatistikHeaderRight} />
          )}
```

- [ ] **Step 2: Update StatistikPage to accept `role` prop and add tab state + imports**

In `src/components/StatistikPage.tsx`, change the component signature from:

```typescript
export default function StatistikPage({ agentSlug, onHeaderRight }: {
  agentSlug: string;
  onHeaderRight?: (node: React.ReactNode) => void;
}) {
```

To:

```typescript
export default function StatistikPage({ agentSlug, role, onHeaderRight }: {
  agentSlug: string;
  role?: string;
  onHeaderRight?: (node: React.ReactNode) => void;
}) {
```

- [ ] **Step 3: Add tab state and lazy import for TrenDaftarSection**

Right after the component signature line (before existing state declarations), add:

```typescript
  const isAdmin = role === 'admin';
  const [statTab, setStatTab] = useState<'ringkasan' | 'tren'>('ringkasan');
```

At the top of the file, add the lazy import after the existing imports:

```typescript
import { BarChart3, TrendingUp } from 'lucide-react';
import { lazy, Suspense } from 'react';
const TrenDaftarSection = lazy(() => import('./TrenDaftarSection'));
```

Note: `BarChart3` and `TrendingUp` are for the tab icons. Also add `lazy` and `Suspense` to the existing `react` import — merge them. The final react import should be:

```typescript
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
```

And add separate:

```typescript
import { BarChart3, TrendingUp } from 'lucide-react';
```

(Merge `BarChart3` and `TrendingUp` into the existing lucide-react import line.)

- [ ] **Step 4: Add the tab bar and conditional rendering**

In the return statement, find the opening `<div>` at line ~519:

```typescript
  return (
    <div className={`px-4 pt-4 pb-8 space-y-3 max-w-lg mx-auto transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
```

Replace with:

```typescript
  return (
    <div className="max-w-lg mx-auto">
      {/* ── Admin Tab Bar ── */}
      {isAdmin && (
        <div className="sticky top-[53px] z-20 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700">
          <div className="px-4 py-2">
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
              {([
                { id: 'ringkasan' as const, label: 'Ringkasan', Icon: BarChart3 },
                { id: 'tren' as const, label: 'Tren Daftar', Icon: TrendingUp },
              ]).map(tab => {
                const active = statTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => { setStatTab(tab.id); window.scrollTo({ top: 0 }); }}
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
      )}

      {/* ── Ringkasan Tab (existing content) ── */}
      {(!isAdmin || statTab === 'ringkasan') && (
      <div className={`px-4 pt-4 pb-8 space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
```

And at the very end of the return, before the final closing `</div>` and after the modals, close the ringkasan wrapper and add the tren tab:

Find the closing of the component (the final `</div>` before the closing `);`). Replace:

```typescript
      </StatListModal>
    </div>
  );
```

With:

```typescript
      </StatListModal>
      </div>
      )}

      {/* ── Tren Daftar Tab ── */}
      {isAdmin && statTab === 'tren' && (
        <Suspense fallback={
          <div className="px-4 pt-4 pb-8 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />)}
            </div>
            <div className="h-52 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
            <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
          </div>
        }>
          <TrenDaftarSection />
        </Suspense>
      )}
    </div>
  );
```

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardLayout.tsx src/components/StatistikPage.tsx
git commit -m "feat: add admin-only tab bar to StatistikPage"
```

---

### Task 5: Frontend — TrenDaftarSection Scaffold (Fetch + Loading + Error + Stat Cards)

**Files:**
- Create: `src/components/TrenDaftarSection.tsx`

- [ ] **Step 1: Create TrenDaftarSection with data fetching, year selector, types, and Section 1 (stat cards)**

Create the file `src/components/TrenDaftarSection.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Calendar, Star, TrendingUp, TrendingDown, Clock,
  CheckCircle, Wallet, Package, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import { trackEvent } from '../utils/analytics';

// ── Types ──

interface TrenSummary {
  totalDaftar: number; totalDaftarPrev: number; growthPct: number; avgPerMonth: number;
  peakMonth: string; peakMonthCount: number; slowestMonth: string; slowestMonthCount: number;
}

interface MonthlyItem { month: number; label: string; count: number; countPrev: number; }
interface RevenueMonthly { month: number; label: string; total: number; }
interface AgentRank { slug: string; name: string; photo: string; count: number; }
interface PaketRank { paket: string; count: number; pct: number; }
interface DistItem { range: string; pct: number; }
interface AgeItem { range: string; count: number; pct: number; }

interface TrenData {
  period: string; periodPrev: string;
  summary: TrenSummary;
  monthly: MonthlyItem[];
  heatmap: Record<string, number[]>;
  revenue: { totalMasuk: number; avgPerMonth: number; monthly: RevenueMonthly[]; };
  insights: { leadTimeAvg: number; conversionRate: number; pelunasanAvg: number; topPaket: string; };
  gender: { perempuan: number; lakiLaki: number; };
  ageDistribution: AgeItem[];
  ageAvg: number;
  leadTimeDistribution: DistItem[];
  pelunasanDistribution: DistItem[];
  pelunasanFastPct: number;
  daftarVsBerangkat: number[][];
  agentRanking: AgentRank[];
  paketRanking: PaketRank[];
}

// ── Helpers ──

function fmtRpShort(n: number): string {
  if (!n) return 'Rp0';
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000_000) { const j = n / 1_000_000; return `Rp${j % 1 === 0 ? j : j.toFixed(1)}jt`; }
  if (n >= 1_000) return `Rp${Math.round(n / 1_000)}rb`;
  return `Rp${n.toLocaleString('id-ID')}`;
}

function fmtRp(n: number): string {
  if (!n) return 'Rp0';
  return `Rp${n.toLocaleString('id-ID')}`;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// ── Card wrapper ──

function Card({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">{title}</p>
        {extra}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Component ──

export default function TrenDaftarSection() {
  const [data, setData] = useState<TrenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const mounted = useRef(false);

  // Track page view once
  useEffect(() => { if (!mounted.current) { trackEvent('feature', 'open_tren_daftar'); mounted.current = true; } }, []);

  // Fetch available years
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/laporan/tren-daftar/years', { headers: { ...getAuthHeaders() } });
        const json = await res.json();
        if (json.success && json.data.length > 0) {
          setAvailableYears(json.data);
          setSelectedYear(json.data[0]);
        }
      } catch { /* silent */ }
    })();
  }, []);

  // Fetch tren data when year changes
  const fetchTren = useCallback(async (year: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/laporan/tren-daftar?hijriahYear=${year}`, { headers: { ...getAuthHeaders() } });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error || 'Gagal memuat data');
    } catch {
      setError('Gagal terhubung ke server');
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedYear) fetchTren(selectedYear); }, [selectedYear, fetchTren]);

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const gridStroke = isDark ? '#1e293b' : '#f1f5f9';

  // ── Loading skeleton ──
  if (loading && !data) {
    return (
      <div className="px-4 pt-4 pb-8 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />)}
        </div>
        <div className="h-52 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
      </div>
    );
  }

  // ── Error state ──
  if (error && !data) {
    return (
      <div className="px-4 pt-4">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const d = data;
  const growthPositive = d.summary.growthPct >= 0;

  return (
    <div className={`px-4 pt-4 pb-8 space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* ── Year Selector ── */}
      {availableYears.length > 1 && (
        <div className="flex justify-end">
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="h-8 text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 pr-6 outline-none appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
          >
            {availableYears.map(y => <option key={y} value={y}>{y} H</option>)}
          </select>
        </div>
      )}

      {/* ── Section 1: Stat Cards ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Total Daftar */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40 mb-2">
            <Users size={16} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{d.summary.totalDaftar}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Total Daftar {d.period}H</p>
          <span className={`inline-block mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
            growthPositive ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
          }`}>{growthPositive ? '+' : ''}{d.summary.growthPct}% vs {d.periodPrev}H</span>
        </div>

        {/* Rata-rata/Bulan */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800/40 mb-2">
            <Calendar size={16} className="text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{d.summary.avgPerMonth}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Rata-rata / Bulan</p>
        </div>

        {/* Bulan Puncak */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center border border-amber-100 dark:border-amber-800/40 mb-2">
            <Star size={16} className="text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-lg font-bold text-gray-800 dark:text-white">{d.summary.peakMonth}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Bulan Puncak</p>
          <span className="inline-block mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">{d.summary.peakMonthCount} jamaah</span>
        </div>

        {/* Growth YoY */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
          <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center border border-violet-100 dark:border-violet-800/40 mb-2">
            <TrendingUp size={16} className="text-violet-600 dark:text-violet-400" />
          </div>
          <p className={`text-2xl font-bold ${growthPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{growthPositive ? '+' : ''}{d.summary.growthPct}%</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Growth YoY</p>
          <span className="inline-block mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">{d.summary.totalDaftarPrev} &rarr; {d.summary.totalDaftar}</span>
        </div>
      </div>

      {/* Sections 2-12 rendered below — added in subsequent tasks */}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v 'virtual:pwa-register'`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrenDaftarSection.tsx
git commit -m "feat: TrenDaftarSection scaffold — fetch, loading, stat cards"
```

---

### Task 6: Frontend — Section 2 (Monthly Chart) + Section 3 (Revenue Chart)

**Files:**
- Modify: `src/components/TrenDaftarSection.tsx`

- [ ] **Step 1: Add custom tooltips and the Monthly + Revenue chart sections**

In `TrenDaftarSection.tsx`, find the comment `{/* Sections 2-12 rendered below — added in subsequent tasks */}` and replace it with:

```tsx
      {/* ── Section 2: Pendaftaran per Bulan ── */}
      <Card title="Pendaftaran per Bulan" extra={
        <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{d.period}H vs {d.periodPrev}H</span>
      }>
        {/* Custom Legend */}
        <div className="flex gap-3 mb-2">
          <span className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500" />{d.period}H</span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium"><span className="w-2 h-2 rounded-full bg-gray-300" />{d.periodPrev}H</span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={d.monthly} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white dark:bg-slate-800 shadow-lg border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{payload[0]?.value} jamaah</p>
                  {payload[1] && <p className="text-[10px] text-gray-400">{d.periodPrev}H: {payload[1].value}</p>}
                </div>
              );
            }} />
            <Bar dataKey="count" name={`${d.period}H`} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="countPrev" name={`${d.periodPrev}H`} fill="#d1d5db" radius={[4, 4, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Section 3: Revenue Masuk per Bulan ── */}
      <Card title="Revenue Masuk per Bulan" extra={
        <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{d.period}H</span>
      }>
        <div className="flex gap-4 mb-3">
          <div>
            <p className="text-[10px] text-gray-400">Total Masuk</p>
            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{fmtRpShort(d.revenue.totalMasuk)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Rata-rata/bln</p>
            <p className="text-base font-bold text-gray-800 dark:text-white">{fmtRpShort(d.revenue.avgPerMonth)}</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={d.revenue.monthly} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="trenEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => v >= 1_000_000_000 ? `${(v/1_000_000_000).toFixed(1)}M` : v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}jt` : String(v)} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white dark:bg-slate-800 shadow-lg border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtRp(payload[0]?.value as number)}</p>
                </div>
              );
            }} />
            <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5} fill="url(#trenEmeraldGrad)"
              dot={{ r: 3, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* SECTIONS_CONTINUE */}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -v 'virtual:pwa-register'`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrenDaftarSection.tsx
git commit -m "feat: TrenDaftarSection — monthly chart + revenue chart"
```

---

### Task 7: Frontend — Section 4 (Heatmap) + Section 5 (Insights)

**Files:**
- Modify: `src/components/TrenDaftarSection.tsx`

- [ ] **Step 1: Replace `{/* SECTIONS_CONTINUE */}` with heatmap + insights sections**

```tsx
      {/* ── Section 4: Heatmap Pendaftaran ── */}
      <Card title="Heatmap Pendaftaran">
        {(() => {
          const years = Object.keys(d.heatmap).sort((a, b) => b.localeCompare(a));
          const allVals = years.flatMap(y => d.heatmap[y]);
          const hMin = Math.min(...allVals.filter(v => v > 0), 0);
          const hMax = Math.max(...allVals, 1);
          const COLORS = ['#d1fae5', '#6ee7b7', '#34d399', '#10b981', '#065f46'];
          const getColor = (v: number) => v === 0 ? (isDark ? '#1e293b' : '#f3f4f6') : COLORS[Math.min(4, Math.floor(((v - hMin) / (hMax - hMin)) * 4.99))];
          const getTextColor = (v: number) => { const idx = v === 0 ? -1 : Math.min(4, Math.floor(((v - hMin) / (hMax - hMin)) * 4.99)); return idx >= 3 ? '#fff' : '#065f46'; };
          return (
            <div>
              {/* Month headers */}
              <div className="grid gap-[3px] mb-1" style={{ gridTemplateColumns: '36px repeat(12, 1fr)' }}>
                <div />
                {MONTH_LABELS.map(m => <div key={m} className="text-[9px] text-gray-400 text-center">{m}</div>)}
              </div>
              {/* Year rows */}
              {years.map(yr => (
                <div key={yr} className="grid gap-[3px] mb-[3px]" style={{ gridTemplateColumns: '36px repeat(12, 1fr)' }}>
                  <div className="text-[9px] font-bold text-gray-500 dark:text-slate-400 flex items-center">{yr}H</div>
                  {d.heatmap[yr].map((v, i) => (
                    <div key={i} className="aspect-square rounded-[4px] flex items-center justify-center"
                      style={{ backgroundColor: getColor(v), color: v === 0 ? (isDark ? '#475569' : '#d1d5db') : getTextColor(v) }}>
                      <span className="text-[8px] font-bold">{v || ''}</span>
                    </div>
                  ))}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center justify-end gap-1.5 mt-2">
                <span className="text-[9px] text-gray-400">Sedikit</span>
                {COLORS.map((c, i) => <div key={i} className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: c }} />)}
                <span className="text-[9px] text-gray-400">Banyak</span>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* ── Section 5: Insight Cards ── */}
      <Card title="Insight">
        {[
          { icon: Clock, color: 'emerald', title: 'Lead time rata-rata', desc: 'Dari daftar sampai berangkat', value: `${d.insights.leadTimeAvg} bln`, vColor: 'text-emerald-600 dark:text-emerald-400' },
          { icon: CheckCircle, color: 'blue', title: 'Conversion rate', desc: 'Jamaah yang sudah lunas', value: `${d.insights.conversionRate}%`, vColor: 'text-blue-600 dark:text-blue-400' },
          { icon: Wallet, color: 'emerald', title: 'Kecepatan pelunasan', desc: 'Rata-rata waktu lunas', value: `${d.insights.pelunasanAvg} bln`, vColor: 'text-emerald-600 dark:text-emerald-400' },
          { icon: TrendingDown, color: 'amber', title: 'Bulan paling sepi', desc: 'Pendaftaran terendah', value: `${d.summary.slowestMonth} (${d.summary.slowestMonthCount})`, vColor: 'text-amber-600 dark:text-amber-400' },
          { icon: Package, color: 'violet', title: 'Paket terlaris', desc: 'Paling banyak diminati', value: d.insights.topPaket, vColor: 'text-violet-600 dark:text-violet-400' },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className={`flex items-center gap-2.5 py-2.5 ${i < 4 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}`}>
              <div className={`w-9 h-9 rounded-[10px] bg-${item.color}-50 dark:bg-${item.color}-900/20 flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={`text-${item.color}-600 dark:text-${item.color}-400`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 dark:text-white">{item.title}</p>
                <p className="text-[11px] text-gray-400 dark:text-slate-500">{item.desc}</p>
              </div>
              <span className={`text-sm font-bold flex-shrink-0 ${item.vColor}`}>{item.value}</span>
            </div>
          );
        })}
      </Card>

      {/* SECTIONS_CONTINUE_2 */}
```

**Important note about Tailwind dynamic classes:** The `bg-${item.color}-50` pattern won't work with Tailwind's JIT compiler because the classes are dynamically constructed. Replace the insight cards icon containers with inline styles or use a lookup map. Replace the insight items array with explicit classes:

Actually, to keep the code clean and working with Tailwind, replace the insights section's icon/color logic with a static map. Change the insight items to use full class names:

```tsx
      {/* ── Section 5: Insight Cards ── */}
      <Card title="Insight">
        {([
          { icon: Clock, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconColor: 'text-emerald-600 dark:text-emerald-400', title: 'Lead time rata-rata', desc: 'Dari daftar sampai berangkat', value: `${d.insights.leadTimeAvg} bln`, vColor: 'text-emerald-600 dark:text-emerald-400' },
          { icon: CheckCircle, bg: 'bg-blue-50 dark:bg-blue-900/20', iconColor: 'text-blue-600 dark:text-blue-400', title: 'Conversion rate', desc: 'Jamaah yang sudah lunas', value: `${d.insights.conversionRate}%`, vColor: 'text-blue-600 dark:text-blue-400' },
          { icon: Wallet, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconColor: 'text-emerald-600 dark:text-emerald-400', title: 'Kecepatan pelunasan', desc: 'Rata-rata waktu lunas', value: `${d.insights.pelunasanAvg} bln`, vColor: 'text-emerald-600 dark:text-emerald-400' },
          { icon: TrendingDown, bg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'text-amber-600 dark:text-amber-400', title: 'Bulan paling sepi', desc: 'Pendaftaran terendah', value: `${d.summary.slowestMonth} (${d.summary.slowestMonthCount})`, vColor: 'text-amber-600 dark:text-amber-400' },
          { icon: Package, bg: 'bg-violet-50 dark:bg-violet-900/20', iconColor: 'text-violet-600 dark:text-violet-400', title: 'Paket terlaris', desc: 'Paling banyak diminati', value: d.insights.topPaket, vColor: 'text-violet-600 dark:text-violet-400' },
        ] as const).map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className={`flex items-center gap-2.5 py-2.5 ${i < 4 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}`}>
              <div className={`w-9 h-9 rounded-[10px] ${item.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={item.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 dark:text-white">{item.title}</p>
                <p className="text-[11px] text-gray-400 dark:text-slate-500">{item.desc}</p>
              </div>
              <span className={`text-sm font-bold flex-shrink-0 ${item.vColor}`}>{item.value}</span>
            </div>
          );
        })}
      </Card>

      {/* SECTIONS_CONTINUE_2 */}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -v 'virtual:pwa-register'`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrenDaftarSection.tsx
git commit -m "feat: TrenDaftarSection — heatmap + insight cards"
```

---

### Task 8: Frontend — Section 6 (Gender) + Section 7 (Age) + Section 8 (Lead Time) + Section 9 (Pelunasan)

**Files:**
- Modify: `src/components/TrenDaftarSection.tsx`

- [ ] **Step 1: Replace `{/* SECTIONS_CONTINUE_2 */}` with gender, age, lead time, and pelunasan sections**

```tsx
      {/* ── Section 6: Distribusi Gender ── */}
      <Card title="Distribusi Gender" extra={<span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{d.period}H</span>}>
        {(() => {
          const total = d.gender.perempuan + d.gender.lakiLaki || 1;
          const pPct = Math.round((d.gender.perempuan / total) * 100);
          const lPct = 100 - pPct;
          return (
            <div>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full border-[3px] border-pink-500 bg-pink-50 dark:bg-pink-900/20 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-pink-500">{pPct}%</span>
                    <span className="text-[10px] font-semibold text-pink-500">Perempuan</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{d.gender.perempuan} orang</p>
                </div>
                <span className="text-[10px] font-bold text-gray-300 dark:text-slate-600">vs</span>
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full border-[3px] border-blue-500 bg-blue-50 dark:bg-blue-900/20 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-blue-500">{lPct}%</span>
                    <span className="text-[10px] font-semibold text-blue-500">Laki-laki</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{d.gender.lakiLaki} orang</p>
                </div>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden w-full mt-3">
                <div className="bg-pink-500" style={{ width: `${pPct}%` }} />
                <div className="bg-blue-500" style={{ width: `${lPct}%` }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] font-semibold text-pink-500">{pPct}% Perempuan</span>
                <span className="text-[9px] font-semibold text-blue-500">{lPct}% Laki-laki</span>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* ── Section 7: Distribusi Umur ── */}
      <Card title="Distribusi Umur Jamaah">
        {(() => {
          const AGE_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
          const maxPct = Math.max(...d.ageDistribution.map(a => a.pct), 1);
          const topAge = d.ageDistribution.reduce((a, b) => b.pct > a.pct ? b : a, d.ageDistribution[0]);
          return (
            <div>
              {d.ageDistribution.map((item, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-gray-500 w-[50px] flex-shrink-0">{item.range}</span>
                  <div className="flex-1 h-4 bg-gray-100 dark:bg-slate-700 rounded-[5px] overflow-hidden">
                    <div className="h-full rounded-[5px] transition-all duration-500" style={{ width: `${(item.pct / maxPct) * 100}%`, backgroundColor: AGE_COLORS[i] }} />
                  </div>
                  <span className="text-[10px] font-bold w-9 text-right" style={{ color: AGE_COLORS[i] }}>{item.pct}%</span>
                </div>
              ))}
              <div className="mt-2.5 p-2.5 bg-gray-50 dark:bg-slate-900 rounded-[10px]">
                <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">Mayoritas usia {topAge?.range} tahun ({topAge?.pct}%)</p>
                <p className="text-[10px] text-gray-400">Rata-rata umur: {d.ageAvg} tahun</p>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* ── Section 8: Lead Time Pendaftaran ── */}
      <Card title="Lead Time Pendaftaran">
        <p className="text-[11px] text-gray-400 mb-3">Berapa bulan sebelum berangkat jamaah mendaftar</p>
        {(() => {
          const LT_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
          const maxPct = Math.max(...d.leadTimeDistribution.map(l => l.pct), 1);
          return d.leadTimeDistribution.map((item, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold text-gray-500 w-[60px] flex-shrink-0">{item.range}</span>
              <div className="flex-1 h-4 bg-gray-100 dark:bg-slate-700 rounded-[5px] overflow-hidden">
                <div className="h-full rounded-[5px] transition-all duration-500" style={{ width: `${(item.pct / maxPct) * 100}%`, backgroundColor: LT_COLORS[i] }} />
              </div>
              <span className="text-[10px] font-bold w-9 text-right" style={{ color: LT_COLORS[i] }}>{item.pct}%</span>
            </div>
          ));
        })()}
      </Card>

      {/* ── Section 9: Kecepatan Pelunasan ── */}
      <Card title="Kecepatan Pelunasan">
        <p className="text-[11px] text-gray-400 mb-3">Rata-rata waktu dari daftar sampai lunas</p>
        {(() => {
          const PL_COLORS = ['#10b981', '#34d399', '#3b82f6', '#f59e0b', '#ef4444'];
          const maxPct = Math.max(...d.pelunasanDistribution.map(p => p.pct), 1);
          return (
            <div>
              {d.pelunasanDistribution.map((item, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-gray-500 w-[60px] flex-shrink-0">{item.range}</span>
                  <div className="flex-1 h-4 bg-gray-100 dark:bg-slate-700 rounded-[5px] overflow-hidden">
                    <div className="h-full rounded-[5px] transition-all duration-500" style={{ width: `${(item.pct / maxPct) * 100}%`, backgroundColor: PL_COLORS[i] }} />
                  </div>
                  <span className="text-[10px] font-bold w-9 text-right" style={{ color: PL_COLORS[i] }}>{item.pct}%</span>
                </div>
              ))}
              <div className="mt-2.5 p-2.5 bg-gray-50 dark:bg-slate-900 rounded-[10px]">
                <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">{d.pelunasanFastPct}% lunas dalam 1 bulan pertama</p>
                <p className="text-[10px] text-gray-400">Rata-rata: {d.insights.pelunasanAvg} bulan dari tanggal daftar</p>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* SECTIONS_CONTINUE_3 */}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -v 'virtual:pwa-register'`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrenDaftarSection.tsx
git commit -m "feat: TrenDaftarSection — gender, age, lead time, pelunasan"
```

---

### Task 9: Frontend — Section 10 (Correlation Heatmap) + Section 11 (Agent Ranking) + Section 12 (Paket Ranking)

**Files:**
- Modify: `src/components/TrenDaftarSection.tsx`

- [ ] **Step 1: Replace `{/* SECTIONS_CONTINUE_3 */}` with the final 3 sections**

```tsx
      {/* ── Section 10: Daftar vs Berangkat ── */}
      <Card title="Daftar vs Berangkat">
        <p className="text-[11px] text-gray-400 mb-2.5">Kapan jamaah daftar untuk berangkat bulan apa</p>
        {(() => {
          const allVals = d.daftarVsBerangkat.flat().filter(v => v > 0);
          const cMin = Math.min(...allVals, 0);
          const cMax = Math.max(...allVals, 1);
          const CORR_COLORS = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1e40af'];
          const getC = (v: number) => v === 0 ? (isDark ? '#1e293b' : '#f3f4f6') : CORR_COLORS[Math.min(4, Math.floor(((v - cMin) / (cMax - cMin)) * 4.99))];
          const getT = (v: number) => { const idx = v === 0 ? -1 : Math.min(4, Math.floor(((v - cMin) / (cMax - cMin)) * 4.99)); return idx >= 3 ? '#fff' : '#1e40af'; };
          return (
            <div className="overflow-x-auto">
              <div style={{ minWidth: 340 }}>
                {/* Column headers — berangkat months */}
                <div className="grid gap-[2px] mb-[2px]" style={{ gridTemplateColumns: '32px repeat(12, 1fr)' }}>
                  <div className="text-[7px] text-gray-300 dark:text-slate-600 text-center">Brkt&rarr;</div>
                  {MONTH_LABELS.map(m => <div key={m} className="text-[9px] text-gray-400 text-center">{m}</div>)}
                </div>
                {/* Rows — daftar months */}
                {d.daftarVsBerangkat.map((row, ri) => (
                  <div key={ri} className="grid gap-[2px] mb-[2px]" style={{ gridTemplateColumns: '32px repeat(12, 1fr)' }}>
                    <div className="text-[9px] text-gray-400 text-right pr-1 flex items-center justify-end">{MONTH_LABELS[ri]}</div>
                    {row.map((v, ci) => (
                      <div key={ci} className="min-h-[22px] rounded-[3px] flex items-center justify-center"
                        style={{ backgroundColor: getC(v), color: v === 0 ? (isDark ? '#475569' : '#d1d5db') : getT(v) }}>
                        <span className="text-[7px] font-bold">{v || ''}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[9px] text-gray-400">Sumbu Y = bulan daftar</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-gray-400">Sedikit</span>
                    {CORR_COLORS.map((c, i) => <div key={i} className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: c }} />)}
                    <span className="text-[9px] text-gray-400">Banyak</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* ── Section 11: Ranking Agent ── */}
      <AgentRankingSection agents={d.agentRanking} year={d.period} />

      {/* ── Section 12: Paket Terpopuler ── */}
      <Card title="Paket Terpopuler" extra={<span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{d.period}H</span>}>
        {d.paketRanking.map((item, i) => {
          const BADGE_COLORS = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500'];
          const bc = BADGE_COLORS[i] || 'bg-gray-400';
          return (
            <div key={i} className={`flex items-center gap-2.5 py-2 ${i < d.paketRanking.length - 1 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}`}>
              <div className={`w-5 h-5 rounded-[6px] ${bc} flex items-center justify-center flex-shrink-0`}>
                <span className="text-[10px] font-bold text-white">{i + 1}</span>
              </div>
              <span className="text-xs font-semibold text-gray-800 dark:text-white flex-1">{item.paket}</span>
              <span className="text-[13px] font-bold text-gray-800 dark:text-white">{item.count}</span>
              <span className="text-[10px] text-gray-400 ml-1">{item.pct}%</span>
            </div>
          );
        })}
      </Card>
```

- [ ] **Step 2: Add the AgentRankingSection component above the main export**

Insert this before `export default function TrenDaftarSection()`:

```tsx
// ── Agent Ranking Sub-component ──

const RANK_BAR_COLORS = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-pink-500'];
const AVATAR_COLORS = ['bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'];

function AgentRankingSection({ agents, year }: { agents: AgentRank[]; year: string }) {
  const [showAll, setShowAll] = useState(false);
  const maxCount = agents[0]?.count || 1;
  const visible = showAll ? agents : agents.slice(0, 5);

  return (
    <Card title="Ranking Agent" extra={<span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{year}H</span>}>
      {visible.map((agent, i) => (
        <div key={agent.slug} className={`flex items-center gap-2.5 py-2 ${i < visible.length - 1 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}`}>
          <span className={`text-[10px] font-bold w-4 text-center ${i === 0 ? 'text-amber-500' : 'text-gray-500 dark:text-slate-400'}`}>#{i + 1}</span>
          {agent.photo ? (
            <img src={agent.photo} alt="" className="w-8 h-8 rounded-[10px] object-cover flex-shrink-0" />
          ) : (
            <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
              {getInitials(agent.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{agent.name}</p>
            <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded-[4px] overflow-hidden mt-1">
              <div className={`h-full rounded-[4px] ${RANK_BAR_COLORS[i] || 'bg-gray-400'} transition-all duration-500`}
                style={{ width: `${(agent.count / maxCount) * 100}%` }} />
            </div>
          </div>
          <span className="text-xs font-bold text-gray-800 dark:text-white w-8 text-right">{agent.count}</span>
        </div>
      ))}
      {agents.length > 5 && (
        <button onClick={() => setShowAll(prev => !prev)}
          className="w-full py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-center gap-1">
          {showAll ? <><ChevronUp size={12} /> Tutup</> : <><ChevronDown size={12} /> Lihat semua agent</>}
        </button>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -v 'virtual:pwa-register'`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TrenDaftarSection.tsx
git commit -m "feat: TrenDaftarSection — correlation heatmap, agent ranking, paket ranking"
```

---

### Task 10: Analytics Tracking + Final Label Updates

**Files:**
- Modify: `server.js` (featureLabels in analytics summary endpoint)

- [ ] **Step 1: Add `open_tren_daftar` to featureLabels in the analytics summary endpoint**

In `server.js`, find the `featureLabels` object in the analytics summary endpoint and add:

```javascript
      open_tren_daftar: 'Tren Daftar',
```

to the existing object (after the other `open_*` labels).

- [ ] **Step 2: Commit**

```bash
git add server.js
git commit -m "feat: add open_tren_daftar analytics label"
```

---

### Task 11: End-to-End Verification

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v 'virtual:pwa-register'`
Expected: No errors (clean output).

- [ ] **Step 2: Test the full flow manually**

1. Login as admin
2. Navigate to Statistik page
3. Verify the tab bar appears with "Ringkasan" and "Tren Daftar"
4. Click "Tren Daftar" — verify loading skeleton appears, then data loads
5. Switch year dropdown — verify data refreshes
6. Check all 12 sections render correctly
7. Click "Ringkasan" — verify original stats page appears unchanged
8. Login as non-admin agent — verify no tab bar appears, only normal Statistik content

- [ ] **Step 3: Test dark mode**

Toggle dark mode and verify all 12 sections look correct with dark backgrounds, borders, and text colors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Tren Daftar tab — admin-only aggregate registration analytics"
```
