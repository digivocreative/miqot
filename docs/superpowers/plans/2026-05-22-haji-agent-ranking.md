# Ranking Agent Haji di Tren Daftar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah section "Ranking Agent Haji" di tab Tren Daftar (admin-only), dengan toggle mode Pendaftaran/Keberangkatan dan dropdown tahun masehi sendiri.

**Architecture:** 2 endpoint baru di `server.js` (years list + ranking data), 1 component baru di `TrenDaftarSection.tsx` dengan state lokal, refactor kecil utk ekstrak `AgentRankingList` jadi reusable. Tidak ada DB migration.

**Tech Stack:** Node.js + Express + Supabase (backend), React + TypeScript + Recharts (frontend, sudah ada), Tailwind.

**Spec:** [docs/superpowers/specs/2026-05-22-haji-agent-ranking-design.md](../specs/2026-05-22-haji-agent-ranking-design.md)

**Note on tests:** Per spec, tidak ada automated test ditambah (codebase belum punya pattern test untuk endpoint laporan). Verification via curl + browser smoke test.

---

## Task 1: Backend — endpoint `/api/laporan/tren-daftar/haji-years`

**Files:**
- Modify: `server.js` (insert setelah baris 9624, sebelum `// API: Stats` section)

- [ ] **Step 1: Tambah endpoint baru**

Buka `server.js` dan cari akhir endpoint `GET /api/laporan/tren-daftar` (sekitar baris 9624, ditandai dengan `});` setelah `console.error('[TrenDaftar] Error:'...`). Sebelum komentar `// ──────────────────────────────────────────────` yang mengawali `// API: Stats`, tambahkan:

```javascript
// ── Tren Daftar Haji: Available Masehi Years (Admin only) ──
app.get('/api/laporan/tren-daftar/haji-years', authMiddleware, adminOnly, async (req, res) => {
  try {
    const data = await fetchAllRows(
      supabase
        .from('jamaah_haji')
        .select('thn_masehi, tgl_daftar')
        .order('agent_id', { ascending: true })
        .order('id_haji', { ascending: true })
        .order('id_jamaah', { ascending: true })
    );

    const keberangkatan = [...new Set(
      data.map(d => String(d.thn_masehi || '')).filter(y => /^\d{4}$/.test(y))
    )].sort((a, b) => Number(b) - Number(a));

    const pendaftaran = [...new Set(
      data.map(d => String(d.tgl_daftar || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y))
    )].sort((a, b) => Number(b) - Number(a));

    res.json({ success: true, data: { keberangkatan, pendaftaran } });
  } catch (err) {
    console.error('[TrenDaftar/Haji] Years error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data tahun haji' });
  }
});
```

- [ ] **Step 2: Restart server**

Jika dev server berjalan via `npm run dev` (Vite proxy ke Express), restart Express:

```bash
# Hentikan server yg jalan (Ctrl+C), lalu:
node server.js
```

Atau jika pakai pm2/nodemon, biarkan auto-restart.

- [ ] **Step 3: Manual test sebagai admin**

Dapatkan token admin terlebih dahulu (login via UI lalu cek `localStorage.getItem('token')` di browser console, atau pakai akun admin yg sudah login).

```bash
TOKEN="<paste-admin-jwt-here>"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/laporan/tren-daftar/haji-years | jq
```

Expected output:
```json
{
  "success": true,
  "data": {
    "keberangkatan": ["2027", "2026", "2025"],
    "pendaftaran": ["2026", "2025", "2024"]
  }
}
```

Tahun-tahun akan bervariasi tergantung data live.

- [ ] **Step 4: Manual test sebagai non-admin**

```bash
TOKEN="<paste-non-admin-jwt-here>"
curl -s -i -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/laporan/tren-daftar/haji-years | head -5
```

Expected: HTTP `403 Forbidden`.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: add /api/laporan/tren-daftar/haji-years endpoint"
```

---

## Task 2: Backend — endpoint `/api/laporan/tren-daftar/haji-ranking`

**Files:**
- Modify: `server.js` (insert tepat setelah endpoint dari Task 1)

- [ ] **Step 1: Tambah endpoint baru**

Tepat setelah endpoint `haji-years` yang baru ditambahkan, tambahkan:

```javascript
// ── Tren Daftar Haji: Agent Ranking (Admin only) ──
app.get('/api/laporan/tren-daftar/haji-ranking', authMiddleware, adminOnly, async (req, res) => {
  try {
    const year = String(req.query.year || '').trim();
    if (!/^\d{4}$/.test(year)) {
      return res.status(400).json({ error: 'year wajib diisi (4-digit masehi)' });
    }
    const mode = req.query.mode === 'pendaftaran' ? 'pendaftaran' : 'keberangkatan';

    let query = supabase
      .from('jamaah_haji')
      .select('agent_id')
      .not('agent_id', 'is', null)
      .order('agent_id', { ascending: true })
      .order('id_haji', { ascending: true })
      .order('id_jamaah', { ascending: true });

    if (mode === 'keberangkatan') {
      query = query.eq('thn_masehi', year);
    } else {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${Number(year) + 1}-01-01`;
      query = query.gte('tgl_daftar', yearStart).lt('tgl_daftar', yearEnd);
    }

    const rows = await fetchAllRows(query);

    const agentMap = {};
    rows.forEach(r => { agentMap[r.agent_id] = (agentMap[r.agent_id] || 0) + 1; });
    const agentIds = Object.keys(agentMap);

    const { data: agentRows, error: agentErr } = agentIds.length > 0
      ? await supabase.from('agents').select('id, slug, name, photo').in('id', agentIds)
      : { data: [], error: null };
    if (agentErr) throw agentErr;

    const agentInfo = Object.fromEntries((agentRows || []).map(a => [a.id, a]));
    const ranking = Object.entries(agentMap)
      .filter(([id]) => agentInfo[id])
      .map(([id, count]) => ({
        slug: agentInfo[id].slug,
        name: agentInfo[id].name,
        photo: agentInfo[id].photo || '',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({ success: true, data: { ranking, mode, year } });
  } catch (err) {
    console.error('[TrenDaftar/Haji] Ranking error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil ranking agent haji' });
  }
});
```

- [ ] **Step 2: Restart server (jika belum auto-restart)**

```bash
# Ctrl+C lalu: node server.js
```

- [ ] **Step 3: Manual test mode keberangkatan**

```bash
TOKEN="<admin-jwt>"
YEAR="2026"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/laporan/tren-daftar/haji-ranking?mode=keberangkatan&year=$YEAR" | jq
```

Expected output (data bervariasi):
```json
{
  "success": true,
  "data": {
    "ranking": [
      { "slug": "agent-x", "name": "Agent X", "photo": "...", "count": 45 },
      { "slug": "agent-y", "name": "Agent Y", "photo": "", "count": 32 }
    ],
    "mode": "keberangkatan",
    "year": "2026"
  }
}
```

- [ ] **Step 4: Manual test mode pendaftaran**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/laporan/tren-daftar/haji-ranking?mode=pendaftaran&year=$YEAR" | jq '.data.ranking | length'
```

Expected: integer (jumlah agent yg daftarkan jamaah haji di tahun tsb).

- [ ] **Step 5: Manual test edge cases**

```bash
# Missing year
curl -s -i -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/laporan/tren-daftar/haji-ranking?mode=keberangkatan" | head -5
# Expected: HTTP 400, body { "error": "year wajib diisi (4-digit masehi)" }

# Invalid mode → defaults to keberangkatan
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/laporan/tren-daftar/haji-ranking?mode=xxx&year=2026" | jq '.data.mode'
# Expected: "keberangkatan"

# Year tanpa data
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/laporan/tren-daftar/haji-ranking?mode=keberangkatan&year=1999" | jq '.data.ranking'
# Expected: []

# Non-admin
TOKEN_NA="<non-admin-jwt>"
curl -s -i -H "Authorization: Bearer $TOKEN_NA" \
  "http://localhost:3000/api/laporan/tren-daftar/haji-ranking?mode=keberangkatan&year=2026" | head -5
# Expected: HTTP 403
```

- [ ] **Step 6: Cross-check vs /api/haji/stats**

Sebagai admin dgn agent_id-mu sendiri di /api/haji/stats:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/haji/stats?year=$YEAR" | jq '.data.total'
# Note hasilnya.

# Lalu cari agent_id-mu di response ranking:
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/laporan/tren-daftar/haji-ranking?mode=keberangkatan&year=$YEAR" \
  | jq '.data.ranking[] | select(.slug == "<your-slug>") | .count'
# Expected: angka harus match dengan /api/haji/stats `total` field
```

Jika tidak match, debug query filter sebelum lanjut.

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "feat: add /api/laporan/tren-daftar/haji-ranking endpoint"
```

---

## Task 3: Frontend — export `pickNearestMasehiYear` dari StatistikPage

**Files:**
- Modify: `src/components/StatistikPage.tsx:115`

- [ ] **Step 1: Tambah `export` keyword**

Di `src/components/StatistikPage.tsx`, cari baris 115:

```typescript
function pickNearestMasehiYear(years: string[], currentYear = new Date().getFullYear()): string {
```

Ubah jadi:

```typescript
export function pickNearestMasehiYear(years: string[], currentYear = new Date().getFullYear()): string {
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
npx tsc --noEmit
```

Expected: tidak ada error baru. Mungkin ada pre-existing warning, abaikan kecuali terkait `pickNearestMasehiYear`.

- [ ] **Step 3: Commit**

```bash
git add src/components/StatistikPage.tsx
git commit -m "refactor: export pickNearestMasehiYear from StatistikPage"
```

---

## Task 4: Frontend — extract `AgentRankingList` jadi reusable

**Files:**
- Modify: `src/components/TrenDaftarSection.tsx:84-119`

- [ ] **Step 1: Pisah pure-render dari fetch/data wrapping**

Cari `AgentRankingSection` di baris 84-119. Ganti seluruh blok itu dengan:

```tsx
// ── Reusable Agent Ranking List (pure render) ──

function AgentRankingList({ agents }: { agents: AgentRank[] }) {
  const [showAll, setShowAll] = useState(false);
  const maxCount = agents[0]?.count || 1;
  const visible = showAll ? agents : agents.slice(0, 5);

  return (
    <>
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
    </>
  );
}

// ── Umroh Agent Ranking Section (wraps list in Card) ──

function AgentRankingSection({ agents, year }: { agents: AgentRank[]; year: string }) {
  return (
    <Card title="Ranking Agent" extra={<span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{year}H</span>}>
      <AgentRankingList agents={agents} />
    </Card>
  );
}
```

Perhatikan: `RANK_BAR_COLORS`, `AVATAR_COLORS`, `getInitials`, `Card` semua sudah ada di file ini (lines 59-82). Tidak perlu impor tambahan untuk task ini.

- [ ] **Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: tidak ada error baru.

- [ ] **Step 3: Browser smoke test**

Buka dev server (`npm run dev`) lalu navigate ke `/dashboard/statistik/tren-daftar` (akun admin). Verifikasi:
- Section "Ranking Agent" (Umroh) tetap render seperti sebelumnya — list agent, bar chart, rank #1 amber, tombol "Lihat semua" muncul jika >5 agent.
- Tidak ada console error.

- [ ] **Step 4: Commit**

```bash
git add src/components/TrenDaftarSection.tsx
git commit -m "refactor: extract AgentRankingList for reuse in TrenDaftarSection"
```

---

## Task 5: Frontend — `HajiAgentRankingSection` component

**Files:**
- Modify: `src/components/TrenDaftarSection.tsx`

- [ ] **Step 1: Tambah import `pickNearestMasehiYear`**

Di baris 6 (setelah `import { getAuthHeaders } from './LoginPage';`), tambahkan:

```typescript
import { pickNearestMasehiYear } from './StatistikPage';
```

- [ ] **Step 2: Tambah types baru di section types**

Cari komentar `// ── Helpers ──` di file. Tepat sebelum komentar itu, tambahkan:

```typescript
interface HajiYearsData { keberangkatan: string[]; pendaftaran: string[]; }
type HajiRankingMode = 'pendaftaran' | 'keberangkatan';
```

- [ ] **Step 3: Tambah `HajiAgentRankingSection` component**

Tepat setelah definisi `AgentRankingSection` (akhir blok dari Task 4), tambahkan:

```tsx
// ── Haji Agent Ranking Section (independent fetch + mode toggle) ──

function HajiAgentRankingSection() {
  const [mode, setMode] = useState<HajiRankingMode>('keberangkatan');
  const [years, setYears] = useState<HajiYearsData>({ keberangkatan: [], pendaftaran: [] });
  const [yearsLoaded, setYearsLoaded] = useState(false);
  const [selectedYear, setSelectedYear] = useState('');
  const [data, setData] = useState<AgentRank[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const activeYears = mode === 'keberangkatan' ? years.keberangkatan : years.pendaftaran;

  // Fetch years list once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/laporan/tren-daftar/haji-years', { headers: { ...getAuthHeaders() } });
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setYears(json.data);
          const initialActive = (mode === 'keberangkatan' ? json.data.keberangkatan : json.data.pendaftaran) as string[];
          setSelectedYear(pickNearestMasehiYear(initialActive));
          setYearsLoaded(true);
          // If both lists empty, no fetch will follow — clear loading here.
          if (!initialActive.length) { setData([]); setLoading(false); }
        } else {
          setError(json.error || 'Gagal memuat tahun haji');
          setLoading(false);
          setYearsLoaded(true);
        }
      } catch {
        if (!cancelled) { setError('Gagal terhubung ke server'); setLoading(false); setYearsLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When mode changes, re-pick selectedYear if current is not in new mode's list
  useEffect(() => {
    if (!yearsLoaded) return;
    if (!activeYears.length) {
      // Mode has no data → clear year, show empty state.
      if (selectedYear !== '') setSelectedYear('');
      setData([]);
      setLoading(false);
      return;
    }
    if (!activeYears.includes(selectedYear)) {
      setSelectedYear(pickNearestMasehiYear(activeYears));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, years, yearsLoaded]);

  // Fetch ranking whenever mode + year settle on a valid combo
  useEffect(() => {
    if (!yearsLoaded || !selectedYear) {
      // Initial mount (waiting for years) OR empty mode handled by mode-watcher effect.
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await fetch(
          `/api/laporan/tren-daftar/haji-ranking?mode=${mode}&year=${selectedYear}`,
          { headers: { ...getAuthHeaders() } }
        );
        const json = await res.json();
        if (requestId !== requestIdRef.current) return; // stale response
        if (json.success) setData(json.data.ranking);
        else setError(json.error || 'Gagal memuat ranking haji');
      } catch {
        if (requestId === requestIdRef.current) setError('Gagal terhubung ke server');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    })();
  }, [mode, selectedYear, yearsLoaded]);

  const headerExtra = (
    <div className="flex items-center gap-1.5">
      <div className="flex p-0.5 bg-gray-100 dark:bg-slate-700 rounded-md">
        {(['pendaftaran', 'keberangkatan'] as HajiRankingMode[]).map(m => (
          <button key={m}
            onClick={() => setMode(m)}
            className={`px-2 py-0.5 text-[9px] font-semibold rounded-[5px] transition-all ${
              mode === m
                ? 'bg-white dark:bg-slate-600 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-gray-400 dark:text-slate-400'
            }`}>
            {m === 'pendaftaran' ? 'Pdftr' : 'Brkt'}
          </button>
        ))}
      </div>
      <select
        value={selectedYear}
        onChange={e => setSelectedYear(e.target.value)}
        disabled={activeYears.length === 0}
        className="h-6 text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md px-1.5 pr-5 outline-none appearance-none cursor-pointer disabled:opacity-50"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
      >
        {activeYears.length === 0 && <option value="">—</option>}
        {activeYears.map(y => <option key={y} value={y}>{y} M</option>)}
      </select>
    </div>
  );

  return (
    <Card title="Ranking Agent Haji" extra={headerExtra}>
      {loading && (
        <div className="space-y-2 py-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-8 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      )}
      {!loading && error && (
        <p className="text-[11px] text-red-500 dark:text-red-400 text-center py-3">{error}</p>
      )}
      {!loading && !error && data && data.length === 0 && (
        <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center py-3">
          {selectedYear
            ? `Belum ada data jamaah haji untuk tahun ${selectedYear} M`
            : 'Belum ada data jamaah haji'}
        </p>
      )}
      {!loading && !error && data && data.length > 0 && <AgentRankingList agents={data} />}
    </Card>
  );
}
```

- [ ] **Step 4: Render `<HajiAgentRankingSection />` di parent**

Di file yang sama, cari `<AgentRankingSection agents={d.agentRanking} year={d.period} />` di dalam fungsi `TrenDaftarSection`. Tepat setelah baris itu, sisipkan:

```tsx
      {/* Ranking Agent Haji */}
      <HajiAgentRankingSection />
```

Hasil akhirnya akan terlihat:

```tsx
      {/* Ranking Agent */}
      <AgentRankingSection agents={d.agentRanking} year={d.period} />

      {/* Ranking Agent Haji */}
      <HajiAgentRankingSection />
```

- [ ] **Step 5: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: tidak ada error baru.

- [ ] **Step 6: Browser smoke test**

Pastikan dev server jalan (`npm run dev` + `node server.js`). Sebagai admin, buka `/dashboard/statistik/tren-daftar`.

Verifikasi:
1. Section "Ranking Agent Haji" muncul tepat di bawah "Ranking Agent" (Umroh).
2. Initial state: mode = "Brkt" (Keberangkatan), year = current year jika ada (mis. 2026M).
3. Loading skeleton sebentar lalu list ranking muncul.
4. Klik toggle "Pdftr" → list dan dropdown year update; dropdown year mungkin berubah ke tahun terdekat di mode pendaftaran.
5. Ganti tahun di dropdown → list reload.
6. Pilih tahun yg tidak ada datanya (mis. 2099 kalau tersedia di list — skip kalau gak ada) → empty state muncul.
7. Console clean (no errors/warnings).

Jika ada bug, fix dulu sebelum lanjut.

- [ ] **Step 7: Commit**

```bash
git add src/components/TrenDaftarSection.tsx
git commit -m "feat: add HajiAgentRankingSection to Tren Daftar tab"
```

---

## Task 6: End-to-end Smoke Test & Cleanup

**Files:** none (verification only)

- [ ] **Step 1: Full UX walkthrough**

Sebagai admin, browser:
1. `/dashboard/statistik` → tab Umroh load normal.
2. Klik tab "Tren Daftar" → load section Umroh ranking + Haji ranking.
3. Ranking Agent (Umroh): dropdown header (hijriah) berubah → list update (Umroh saja, Haji tidak terimbas).
4. Ranking Agent Haji: toggle mode + ganti year → list Haji update (Umroh tidak terimbas).
5. Refresh page → state reset bersih.

- [ ] **Step 2: Non-admin sanity check**

Logout, login sebagai akun non-admin:
1. Coba akses `/dashboard/statistik/tren-daftar` langsung di URL bar.
2. Expected: redirect/coerce ke tab Umroh (existing guard di [StatistikPage.tsx:399](src/components/StatistikPage.tsx:399)).
3. Tab "Tren Daftar" tidak muncul di tab bar.

- [ ] **Step 3: Visual regression spot-check**

- Mode toggle dan year dropdown muat di satu baris header card, tidak overflow di mobile (resize browser ke width 375px).
- Empty state, error state, loading skeleton render tanpa overlap.
- Dark mode: warna teks/border konsisten dengan section Umroh.

- [ ] **Step 4: Check existing tests masih pass**

```bash
node --test tests/
```

Expected: existing tests masih pass. Tidak ada test baru ditambah, jadi cuma memastikan tidak ada regresi tak terduga.

- [ ] **Step 5: Final commit (jika ada fix dari smoke test)**

Jika di Step 1-3 ada bug yg di-fix:

```bash
git add -A
git commit -m "fix: address smoke test findings for Haji agent ranking"
```

Jika tidak ada perubahan, skip.

- [ ] **Step 6: Optional — bump dokumentasi**

Tidak ada dokumentasi user-facing yg perlu diubah (fitur internal admin). Spec di `docs/superpowers/specs/2026-05-22-haji-agent-ranking-design.md` sudah ada sebagai reference.

---

## Plan Summary

| Task | Files | Estimasi |
|------|-------|----------|
| 1. Backend `/haji-years` | `server.js` (+~25 lines) | 15 min |
| 2. Backend `/haji-ranking` | `server.js` (+~50 lines) | 25 min |
| 3. Export `pickNearestMasehiYear` | `StatistikPage.tsx` (1 word) | 2 min |
| 4. Extract `AgentRankingList` | `TrenDaftarSection.tsx` (refactor) | 10 min |
| 5. `HajiAgentRankingSection` | `TrenDaftarSection.tsx` (+~130 lines) | 30 min |
| 6. Smoke test | none | 15 min |

**Total**: ~100 menit. 5 commit incremental.
