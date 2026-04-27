# Statistik Haji Tab — Design

**Date:** 2026-04-27
**Status:** Approved
**Author:** Bagas + Claude

## Goal

Tambah tab **Haji** ke `StatistikPage` di samping tab Umroh yang sudah ada, plus `Tren Daftar` (admin-only). Tab Haji menampilkan ringkasan jamaah haji, estimasi komisi USD bertahap ($200 saat CICILAN + $300 saat LUNAS), dan breakdown per tahun keberangkatan.

## Non-Goals

- Tidak menambah scraping field baru ke `jamaah_haji` (pakai data yang sudah disinkron).
- Tidak menampilkan list "Berangkat Mendatang" atau "Outstanding" untuk haji — data legacy haji tidak punya `tgl_berangkat` per-jamaah atau `sisa` yang akurat.
- Tidak mendukung konversi USD→IDR. Komisi haji ditampilkan murni dalam USD.

## Background

`StatistikPage.tsx` saat ini punya:
- 2 tab admin: `Ringkasan` (Umroh) + `Tren Daftar`. Non-admin hanya lihat konten `Ringkasan` tanpa tab bar.
- Year dropdown header (hijriah) untuk filter Umroh.
- PIN gate (1-jam TTL via sessionStorage).
- Background sync polling.

`/api/haji/stats` sudah ada tapi minimal: hanya `total / lunas / cicilan / belumBayar / byTahun / byJenis / lastSync`. Tidak ada komisi, tidak ada year filter.

`jamaah_haji` punya kolom: `agent_id, id_haji, id_jamaah, nama, jk, alamat, telp, thn_hijriyah, thn_masehi, perwakilan, marketing, paket, staff, jenis, status_bayar, status_berangkat, bpih_url, surat_pernyataan_url, synced_at`. Status_bayar: `LUNAS`, `CICILAN`, `BELUM BAYAR`, `LEBIH BAYAR`.

Komisi haji = $500 USD per jamaah, dibayarkan bertahap: $200 saat status CICILAN, $300 saat status LUNAS.

## Architecture

Tiga komponen yang berubah:

1. **Backend** — `server.js`: extend `GET /api/haji/stats` dengan komisi USD, year filter masehi, dan breakdown per tahun.
2. **Frontend shell** — `src/components/StatistikPage.tsx`: tambah tab `'umroh'|'haji'|'tren'`, year dropdown context-aware (hijriah/masehi).
3. **Frontend section baru** — `src/components/StatistikHajiSection.tsx`: lazy-loaded content tab Haji.
4. **Routing** — `src/components/DashboardLayout.tsx`: tambah segment `/dashboard/statistik/haji`.

Komponen-komponen ini independent: section haji bisa dikembangkan tanpa menyentuh konten umroh, dan backend stats bisa di-test terpisah.

## Tab Bar & Visibility

- **Non-admin (agent):** `[ Umroh ] [ Haji ]` (2 tabs).
- **Admin:** `[ Umroh ] [ Haji ] [ Tren Daftar ]` (3 tabs).

State rename: `'ringkasan' | 'tren'` → `'umroh' | 'haji' | 'tren'`. Default tab = `umroh`.

URL routing:
- `/dashboard/statistik` → Umroh
- `/dashboard/statistik/haji` → Haji
- `/dashboard/statistik/tren-daftar` → Tren Daftar (admin-only; agent yang akses ini langsung dilempar ke Umroh)

`getStatistikTabFromPath()` di `DashboardLayout.tsx` perlu update mengenali segment `haji`.

## Year Dropdown (Context-Aware)

Saat ini dropdown selalu hijriah. Karena Haji pakai masehi, dropdown harus context-aware berdasarkan tab aktif.

State:
- `selectedYearHijriah: string` — dipakai tab Umroh + Tren Daftar (existing behavior).
- `selectedYearMasehi: string` — dipakai tab Haji (baru).

Saat user switch tab, dropdown re-render dengan year list yang relevan dan value yang terakhir dipilih untuk tab itu. Format option: `1448 H` untuk hijriah, `2027 M` untuk masehi.

Default:
- Umroh: `1448` jika ada, else `availableYears[0]` (existing).
- Haji: `availableYearsMasehi[0]` (sorted desc, masehi terbanyak/terbaru di paling atas).

`availableYearsMasehi` di-fetch dari `/api/haji/stats` (response field baru). Di-fetch sekali saat tab pertama kali di-load (lazy).

## Backend: `/api/haji/stats` Extension

Extend endpoint existing (backward-compatible — semua field lama tetap ada).

### Query Param Baru

`?year={masehi}` (optional). Kalau ada, semua agregat (count, komisi, breakdownTahun item count) di-filter dengan `eq('thn_masehi', year)`. `availableYears` selalu unfiltered.

### Response Shape Baru

```ts
{
  // existing — tetap ada untuk backward compat
  total, uniqueHaji, lunas, cicilan, belumBayar, byTahun, byJenis, lastSync,

  // baru
  availableYears: string[],          // masehi unfiltered, sorted desc, e.g. ["2030","2029","2028"]
  masehiYear: string | null,         // year aktif (echo dari query/default)
  lebihBayar: number,                // count jamaah LEBIH BAYAR (treat as lunas komisi-wise)
  lunasPercent: number,              // round((lunas + lebihBayar) / total × 100)

  komisi: {
    rate: 500,                       // USD per jamaah
    stage1: 200,                     // cair saat CICILAN
    stage2: 300,                     // cair saat LUNAS
    totalKomisi: number,             // = total × 500
    sudahCair: number,               // (LUNAS + LEBIH_BAYAR) × 500 + CICILAN × 200
    sudahCairCount: number,          // LUNAS + LEBIH_BAYAR + CICILAN
    belumCair: number,               // CICILAN × 300
    belumCairCount: number,          // CICILAN
    potensi: number,                 // BELUM_BAYAR × 500
    potensiCount: number,            // BELUM_BAYAR
    breakdownTahun: [                // sorted by tahun ASC
      {
        tahun: string,                 // thn_masehi
        total: number,
        lunas: number,                 // includes LEBIH BAYAR
        cicilan: number,
        belumBayar: number,
        komisiCair: number,            // USD
        komisiTotal: number            // USD = total × 500
      }
    ]
  }
}
```

### Komisi Calculation

```js
const RATE = 500;
const STAGE1 = 200;
const STAGE2 = 300;

let sudahCair = 0, sudahCairCount = 0;
let belumCair = 0, belumCairCount = 0;
let potensi = 0, potensiCount = 0;

for (const r of rows) {
  const s = (r.status_bayar || '').toUpperCase();
  if (s === 'LUNAS' || s === 'LEBIH BAYAR') {
    sudahCair += RATE;          // +500
    sudahCairCount++;
  } else if (s === 'CICILAN') {
    sudahCair += STAGE1;         // +200
    sudahCairCount++;
    belumCair += STAGE2;         // +300
    belumCairCount++;
  } else {                        // BELUM BAYAR atau unknown
    potensi += RATE;
    potensiCount++;
  }
}
```

Sanity check: `totalKomisi === sudahCair + belumCair + potensi === total × 500`.

### `availableYears`

```js
const ayData = await supabase
  .from('jamaah_haji')
  .select('thn_masehi')
  .eq('agent_id', agentId)
  .not('thn_masehi', 'is', null);

const availableYears = [...new Set(ayData.map(r => r.thn_masehi))]
  .filter(y => y && /^\d{4}$/.test(y))
  .sort((a, b) => b.localeCompare(a));
```

### Default Year

Untuk konsistensi dengan `/api/laporan/stats` (Umroh), kalau `?year` tidak diberikan, server pilih default year masehi terbaru lalu filter ke year tersebut:

```js
let year = req.query.year || null;
if (!year) {
  year = availableYears[0] || null;  // masehi terbaru
}
const baseMatch = { agent_id: agentId };
if (year) baseMatch.thn_masehi = year;
```

Response field `masehiYear` di-echo dari nilai aktif (entah dari query atau default), agar frontend bisa init dropdown ke value yang benar.

## Frontend: `StatistikHajiSection.tsx`

File baru, lazy-loaded dari `StatistikPage`:

```tsx
const StatistikHajiSection = lazy(() => import('./StatistikHajiSection'));
```

### Props

```ts
interface Props {
  selectedYear: string;           // masehi
  onYearsLoaded?: (years: string[]) => void;  // callback agar shell update dropdown
}
```

### Sections (top to bottom)

1. **Headline 4 cards (grid 2×2):**
   - Total Jamaah (icon: Users, emerald)
   - Komisi Cair (icon: Wallet, emerald) — `$X,XXX` atau `$X.XXk`
   - Cicilan + Belum Bayar count (icon: Clock, amber) — gabung jadi satu metric "Belum Lunas"
   - % Pelunasan (icon: TrendingUp, blue) — angka besar `35%`, sub-label "X dari Y lunas"

2. **Estimasi Komisi (USD) card:**
   - Total `$XX,XXX` (besar, hijau)
   - 3-segment progress bar: `sudahCair / belumCair / potensi`
   - 3 detail rows (emerald / blue / amber):
     - "Sudah Cair (N jamaah)" — `$X,XXX`
     - "Belum Cair (N jamaah)" — `$X,XXX`, sub: "Cicilan menunggu pelunasan"
     - "Potensi (N jamaah)" — `$X,XXX`, sub: "Belum bayar — jika lunas semua"

3. **Breakdown per Tahun Keberangkatan:**
   - Bar chart stacked vertical: per `thn_masehi`, segment LUNAS / CICILAN / BELUM BAYAR.
   - Y-axis: count. X-axis: tahun masehi.
   - Tooltip: total jamaah + komisi cair + komisi total per tahun.
   - Empty state: "Belum ada data per tahun" jika `breakdownTahun.length === 0`.

4. **Footer:**
   - "Data per sync terakhir · {fmtSync(lastSync)}"
   - Tombol "Sync Ulang" → POST `/api/haji/sync` (existing endpoint), lalu polling `/api/haji/sync-status` sampai `isSyncing=false`, lalu re-fetch stats.

### Empty State

Kalau `total === 0` dan `lastSync` null: ilustrasi + "Belum ada data jamaah haji. Sync di halaman Haji dulu."

Kalau `total === 0` tapi `lastSync` ada: "Belum ada jamaah haji untuk tahun ini" (data ada di tahun lain).

### Currency Formatter

```ts
function fmtUSD(n: number): string {
  if (!n) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return `$${n.toLocaleString('en-US')}`;
}

function fmtUSDFull(n: number): string {
  return `$${n.toLocaleString('en-US')}`;  // e.g. $12,500
}
```

Headline card pakai `fmtUSD`. Detail card pakai `fmtUSDFull`.

### Loading & Error States

- Skeleton sama pattern dengan Umroh skeleton (4 cards + komisi card + chart).
- Error: tombol "Coba Lagi" yang re-fetch.
- Loading saat year switch: opacity-50 + pointer-events-none (existing pattern).

## Routing & Layout Changes

`DashboardLayout.tsx`:

```ts
function getStatistikTabFromPath(): 'umroh' | 'haji' | 'tren' {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'statistik') {
    if (segments[2] === 'haji') return 'haji';
    if (segments[2] === 'tren-daftar') return 'tren';
  }
  return 'umroh';
}
```

Pass via `initialStatTab` prop ke `StatistikPage`.

## PIN Gate

Single PIN gate untuk seluruh `StatistikPage` (existing). Saat unlocked, semua tab accessible. Tidak ada PIN gate khusus per-tab.

## Testing Plan

### Manual Test Scenarios

1. **Tab visibility:**
   - Login as admin → 3 tabs muncul.
   - Login as agent → 2 tabs muncul (Umroh + Haji), no Tren Daftar.
   - Agent buka URL `/dashboard/statistik/tren-daftar` → redirect/fallback ke Umroh.

2. **Year dropdown switching:**
   - Tab Umroh → dropdown hijriah (`1448 H`, `1447 H`).
   - Switch ke Haji → dropdown jadi masehi (`2030 M`, `2029 M`).
   - Switch balik ke Umroh → dropdown kembali ke hijriah dgn value sebelumnya.

3. **Komisi calculation:**
   - Test agent dengan: 5 LUNAS, 3 CICILAN, 2 BELUM BAYAR, 1 LEBIH BAYAR.
   - Expected: `sudahCair = 6×500 + 3×200 = 3600`, `belumCair = 3×300 = 900`, `potensi = 2×500 = 1000`, `totalKomisi = 5500`.
   - Verify `totalKomisi === total × 500` (11 × 500 = 5500). ✓

4. **Year filter:**
   - Pilih `2027 M` → semua agregat dan breakdownTahun hanya tahun 2027.
   - `availableYears` tetap berisi semua tahun (untuk dropdown).

5. **Empty state:**
   - Agent baru tanpa sync haji → ilustrasi + CTA "Sync di halaman Haji dulu".

6. **Sync flow:**
   - Tombol "Sync Ulang" → polling `/api/haji/sync-status` → re-fetch saat selesai.
   - Mutex check: tombol disabled jika umroh sync sedang berjalan.

### Edge Cases

- `status_bayar = null` atau unrecognized value → masuk bucket "potensi" (treated as belum bayar).
- `thn_masehi = null` atau format salah (bukan 4 digit) → di-filter dari `availableYears` dan `breakdownTahun`. Jamaah tetap dihitung di total/komisi (tidak masuk filter year manapun).
- `total = 0` setelah year filter → headline cards show 0, komisi $0, chart empty state.

## Files Changed

- `server.js` — extend `/api/haji/stats` (~80 lines added/modified).
- `src/components/StatistikPage.tsx` — refactor tab type, year state split, render section haji (~50 lines diff).
- `src/components/DashboardLayout.tsx` — update `getStatistikTabFromPath()` + URL slug update logic (~10 lines diff).
- `src/components/StatistikHajiSection.tsx` — **NEW** (~400 lines).

## Implementation Order

1. Backend `/api/haji/stats` extension + curl test.
2. New `StatistikHajiSection.tsx` (skeleton, headline cards, komisi card, chart, footer).
3. `StatistikPage.tsx` tab refactor + year state split + render haji section.
4. `DashboardLayout.tsx` routing update.
5. Manual end-to-end test in browser (admin + agent role).

## Open Questions

None at design time. All clarifications resolved during brainstorming.
