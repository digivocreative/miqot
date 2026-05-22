# Ranking Agent Haji di Tab Tren Daftar — Design

**Date:** 2026-05-22
**Status:** Approved
**Scope:** Frontend + Backend (no DB migration)

## Context

Tab "Tren Daftar" (`/dashboard/statistik/tren-daftar`, admin only) saat ini memiliki section "Ranking Agent" yang hanya menghitung jamaah umroh per agent. User minta section serupa untuk jamaah haji.

Penempatan & scope ditentukan via brainstorming:
- **Lokasi**: tetap di tab Tren Daftar (admin-only widget). Tidak ada tab baru.
- **Year mode**: dropdown masehi terpisah untuk section Haji (konsisten dengan tab Haji existing). Dropdown hijriah existing tetap untuk section Umroh.
- **Anchor tahun**: toggle mode Pendaftaran ↔ Keberangkatan (mirip pola tab Haji existing di `StatistikHajiSection`).
- **Metric**: count rows di `jamaah_haji` per agent (= jumlah jamaah/porsi).
- **Backend organization**: endpoint terpisah (Approach A), bukan extend endpoint Tren Daftar existing.

## Goals

1. Section "Ranking Agent Haji" muncul di tab Tren Daftar, di bawah Ranking Agent (Umroh).
2. Admin bisa toggle antara Pendaftaran vs Keberangkatan dan ganti tahun masehi.
3. Tidak mengganggu endpoint / payload Tren Daftar existing.

## Non-Goals

- Tidak refactor section lain di Tren Daftar.
- Tidak menambah tab baru.
- Tidak menambah Haji ranking di tab Umroh maupun tab Haji.
- Tidak menambah metric lain (revenue, conversion, dsb) untuk Haji ranking — hanya count.
- Tidak menambah automated test (codebase belum punya test infra untuk endpoint laporan).

## Architecture

### Backend (server.js)

**Endpoint #1: `GET /api/laporan/tren-daftar/haji-years`** (admin only)

Returns list tahun yang tersedia untuk dropdown.

Query: fetch semua row `jamaah_haji` (lintas agent) dengan field `thn_masehi` dan `tgl_daftar`.

Response shape:
```json
{
  "success": true,
  "data": {
    "keberangkatan": ["2027", "2026", "2025"],
    "pendaftaran": ["2026", "2025", "2024"]
  }
}
```

- `keberangkatan`: unique `thn_masehi` non-null, hanya yang match `/^\d{4}$/`, sorted descending.
- `pendaftaran`: unique `YEAR(tgl_daftar)` non-null, hanya yang match `/^\d{4}$/`, sorted descending.

Tidak ada batas tahun minimum (berbeda dengan Umroh yang ≥1447H).

**Endpoint #2: `GET /api/laporan/tren-daftar/haji-ranking?mode=…&year=…`** (admin only)

Returns ranking agent untuk haji.

Query params:
- `mode`: `pendaftaran` | `keberangkatan`. Default `keberangkatan`. Invalid value → fallback ke `keberangkatan` (defensive).
- `year`: 4-digit masehi string. Required. Missing/invalid → 400 `{ error: 'year wajib diisi' }`.

Query filter:
- Both modes: `agent_id IS NOT NULL`
- `keberangkatan`: `thn_masehi = year`
- `pendaftaran`: `tgl_daftar >= ${year}-01-01 AND tgl_daftar < ${year+1}-01-01`

Logic:
1. Fetch matching rows: `agent_id` only.
2. Group by `agent_id`, count rows → `agentMap`.
3. Fetch agent metadata: `SELECT id, slug, name, photo FROM agents WHERE id IN (...)`.
4. Map ke shape `{ slug, name, photo, count }`, sort desc by count.

Response shape:
```json
{
  "success": true,
  "data": {
    "ranking": [
      { "slug": "agent-x", "name": "Agent X", "photo": "...", "count": 45 },
      ...
    ],
    "mode": "keberangkatan",
    "year": "2026"
  }
}
```

Caching: tidak perlu (data ringan, query cepat). Bisa di-add ke `statsCacheGet` pattern existing kalau profiling menunjukkan perlu.

### Frontend (TrenDaftarSection.tsx)

**Refactor**: extract pure-render dari `AgentRankingSection` (lines 84–119) jadi sub-component `AgentRankingList`.

Sub-component signature:
```tsx
function AgentRankingList({ agents }: { agents: AgentRank[] })
```

Berisi: loop agent, avatar/initials, name, bar chart per agent, "Lihat semua" expand/collapse button. Tidak pakai `Card` wrapper (parent yang wrap).

Existing `AgentRankingSection` lalu jadi wrapper tipis:
```tsx
function AgentRankingSection({ agents, year }) {
  return (
    <Card title="Ranking Agent" extra={<span>...{year}H</span>}>
      <AgentRankingList agents={agents} />
    </Card>
  );
}
```

**New component: `HajiAgentRankingSection`**

State:
- `mode`: `'pendaftaran' | 'keberangkatan'`, default `'keberangkatan'`.
- `selectedYear`: string masehi, initially `''`.
- `years`: `{ pendaftaran: string[], keberangkatan: string[] }`, initially `{ pendaftaran: [], keberangkatan: [] }`.
- `data`: `AgentRank[] | null`.
- `loading`: boolean.
- `error`: string.

Effects:
1. On mount: fetch `/api/laporan/tren-daftar/haji-years`. Set `years`. Set `selectedYear` ke current masehi year jika ada di list yang aktif, else `pickNearestMasehiYear(activeYears)`.
2. On `mode` change: pilih ulang `selectedYear` jika current value tidak ada di list mode baru (pakai `pickNearestMasehiYear`).
3. On `mode` atau `selectedYear` change (dan `selectedYear` truthy): fetch `/api/laporan/tren-daftar/haji-ranking?mode=…&year=…`. Set `data` / `error`.

Helper `pickNearestMasehiYear`: sudah ada di `StatistikPage.tsx:115`. Akan di-export dari sana dan di-import oleh `TrenDaftarSection.tsx`.

Render:
```tsx
<Card title="Ranking Agent Haji" extra={
  <div className="flex items-center gap-1.5">
    <ModeSegmentedToggle value={mode} onChange={setMode} />
    <YearDropdown years={activeYears} value={selectedYear} onChange={setSelectedYear} />
  </div>
}>
  {loading && <RankingSkeleton />}
  {error && <p className="text-[11px] text-red-500">Gagal memuat ranking haji</p>}
  {!loading && !error && data && data.length === 0 && (
    <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center py-3">
      Belum ada data jamaah haji untuk tahun {selectedYear} M
    </p>
  )}
  {!loading && !error && data && data.length > 0 && <AgentRankingList agents={data} />}
</Card>
```

Sub-components:
- `ModeSegmentedToggle`: segmented control 2 pilihan, mirip pola umum di codebase. Inline di `TrenDaftarSection.tsx`.
- `YearDropdown`: native `<select>` dengan styling matching dropdown header existing (lihat `StatistikPage.tsx:638-660`). Label format: `{year} M`.
- `RankingSkeleton`: 3 baris pulse, tiap baris ~32px. Inline.

**Placement di parent `TrenDaftarSection`**:
```tsx
{/* Ranking Agent */}
<AgentRankingSection agents={d.agentRanking} year={d.period} />

{/* Ranking Agent Haji (NEW) */}
<HajiAgentRankingSection />
```

Di-insert tepat setelah baris 226 (existing `<AgentRankingSection />`).

`HajiAgentRankingSection` tidak menerima props (self-contained), fetch independent dari parent. Tidak ikut re-render saat parent `selectedYear` (hijriah) berubah.

### Data Flow

```
User opens /dashboard/statistik/tren-daftar
  ↓
TrenDaftarSection mounts
  ↓
  ├─ Umroh: fetch /api/laporan/tren-daftar?hijriahYear=X (existing)
  └─ Haji ranking sub-component mounts
       ├─ fetch /api/laporan/tren-daftar/haji-years
       │    ↓
       │   set years + default selectedYear
       │    ↓
       └─ fetch /api/laporan/tren-daftar/haji-ranking?mode=keberangkatan&year=2026
            ↓
           render ranking list

User toggles mode → re-pick year if needed → refetch ranking
User changes year → refetch ranking
```

## Edge Cases

1. **No haji data sama sekali**: `/haji-years` return `{ keberangkatan: [], pendaftaran: [] }`. Frontend skip render (or render Card dengan empty state "Belum ada data jamaah haji").
2. **Year list kosong untuk satu mode tapi tidak untuk lain**: toggle mode → `selectedYear` tidak ada di list baru → `pickNearestMasehiYear` pick nearest, atau kalau list kosong, jangan fetch ranking, render empty state.
3. **Agent dihapus**: jika `agent_id` di `jamaah_haji` tidak match row di `agents` table, skip (jangan tampilkan "unknown agent").
4. **Agent tanpa photo**: pakai fallback initials (existing pattern di `AgentRankingList`).
5. **Race condition**: jika user spam-click mode toggle, gunakan abort controller atau "last request wins" guard via ref.
6. **Non-admin akses URL Tren Daftar**: guard existing di `StatistikPage.tsx:399` paksa tab ke 'umroh'. Endpoint backend juga di-protect `adminOnly` middleware.

## Error Handling

- Backend 500: log dengan prefix `[TrenDaftar/Haji]` (konsisten dgn existing `[TrenDaftar]`), return `{ error: 'Gagal mengambil ranking haji' }`.
- Backend 400 (missing year): `{ error: 'year wajib diisi' }`.
- Frontend fetch error: set `error` state, render inline message di Card. Tidak retry otomatis.
- Frontend `pickNearestMasehiYear` returns `''` jika list kosong: skip fetch ranking, render empty state.

## Testing & Verification

Manual smoke test (akun admin):

1. Buka `/dashboard/statistik/tren-daftar`. Section "Ranking Agent Haji" muncul di bawah Ranking Agent (Umroh) dengan loading skeleton lalu data.
2. Toggle mode Pendaftaran ↔ Keberangkatan: list ranking berubah, dropdown year mungkin update value jika current year tidak ada di mode baru.
3. Ganti dropdown tahun: list ranking berubah.
4. Pilih tahun yang tidak punya data → empty state "Belum ada data jamaah haji untuk tahun {year} M".
5. "Lihat semua agent" button muncul jika >5 agent, expand/collapse jalan.
6. Logout, login sebagai non-admin → buka `/dashboard/statistik/tren-daftar` → otomatis redirect ke tab Umroh (existing guard).
7. Refresh saat section Haji loading → state reset bersih, tidak ada flicker dari data lama.

Backend sanity check (via curl atau Postman):

- `GET /api/laporan/tren-daftar/haji-years` sebagai admin → 200 dengan shape benar.
- Sebagai non-admin → 403.
- `GET /api/laporan/tren-daftar/haji-ranking?mode=keberangkatan&year=2026` → 200 dengan ranking list.
- Tanpa `year` → 400.
- Invalid `mode=xxx` → fallback ke keberangkatan, tidak error.

Cross-check counts:
- Sum dari `count` di ranking response harus match dengan `COUNT(*)` di `jamaah_haji` dengan filter yang sama (mode + year + agent_id NOT NULL).

## File Changes

- `server.js`: tambah 2 endpoint baru (~80–100 lines) setelah endpoint `GET /api/laporan/tren-daftar` existing (sekitar baris 9624), supaya semua endpoint tren-daftar dikelompokkan.
- `src/components/StatistikPage.tsx`: export helper `pickNearestMasehiYear`.
- `src/components/TrenDaftarSection.tsx`:
  - Import `pickNearestMasehiYear` dari `StatistikPage`.
  - Extract `AgentRankingList` dari `AgentRankingSection`.
  - Tambah `HajiAgentRankingSection` component (~80–100 lines).
  - Render `<HajiAgentRankingSection />` setelah `<AgentRankingSection />` di baris 226.

## Risks / Open Questions

- **Performance**: `/haji-years` fetch semua row `jamaah_haji` hanya untuk extract unique years. Bisa berat jika tabel besar. Alternatif: tambah index atau pakai distinct query. Untuk first version, accept full-scan.
- **Multiple `id_jamaah` per `id_haji`**: count rows bisa over-count jika satu booking haji punya >1 id_jamaah. Asumsi: untuk haji, biasanya 1:1. Jika kemudian terbukti tidak, switch ke `COUNT(DISTINCT id_haji)`.
- **Caching**: tidak di-implement di version pertama. Bisa di-add jika trafik tinggi.
