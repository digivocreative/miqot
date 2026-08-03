# Berangkat Mendatang di Kartu Kalender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menampilkan daftar "Berangkat Mendatang" (60 hari ke depan, jamaah milik agen) di dalam kartu kalender dashboard, di bawah legend, dengan bottom sheet untuk detail.

**Architecture:** Endpoint ringan baru `/api/calendar/berangkat-mendatang` menyajikan potongan data yang selama ini hanya ada di `/api/laporan/stats`. Logika pengelompokan dan komponen barisnya diekstrak dari `StatistikPage.tsx` ke modul bersama, lalu dipakai oleh dashboard dan Statistik.

**Tech Stack:** Express + Supabase (server.js), React 18 + TypeScript + Tailwind + framer-motion + lucide-react (frontend), Vite build.

Spec: [docs/superpowers/specs/2026-08-03-berangkat-mendatang-kalender-design.md](../specs/2026-08-03-berangkat-mendatang-kalender-design.md)

## Global Constraints

- Bahasa antarmuka: **Indonesia**. Komentar kode boleh Indonesia (ikuti berkas sekitarnya).
- Jendela waktu **60 hari ke depan**, konstanta sudah ada: `BERANGKAT_MENDATANG_WINDOW_DAYS` di `lib/laporan-stats.js`. Jangan tulis angka 60 sebagai literal baru di frontend — pakai `berangkatBulan` dari respons.
- Section **tidak** ikut navigasi bulan kalender.
- Angka jamaah di section = jamaah milik agen (`agent_id`-scoped), **berbeda** dari pax kloter nasional di grid. Jangan gabungkan keduanya.
- Root `lib/*.js` = ESM JavaScript polos + `lib/*.d.ts` tulisan tangan. Import dari `src/components/` memakai path `../../lib/nama.js` (perhatikan sufiks `.js`).
- `server.js` **tidak** hot-reload. Endpoint baru butuh restart/deploy.
- Dark mode wajib: setiap kelas warna punya padanan `dark:`.
- Jangan sentuh salinan `cleanTourLeader` di `FlightStatusCard.tsx` / `FlightSharePage.tsx`, dan salinan `WaIcon`/`getInitials` di komponen lain. Di luar ruang lingkup.
- Jangan jalankan uji e2e/`tests/*` menyeluruh (lambat, rawan flaky). Verifikasi = `node --check`, uji unit yang relevan, dan `npm run build`.

---

### Task 1: Ekstrak logika grup ke `lib/berangkat-groups.js`

**Files:**
- Create: `lib/berangkat-groups.js`
- Create: `lib/berangkat-groups.d.ts`
- Create: `tests/berangkat-groups.test.js`
- Modify: `src/components/StatistikPage.tsx`

**Interfaces:**
- Consumes: (tidak ada)
- Produces:
  - `getDestinationFlags(paket: string | null | undefined): DestinationFlag[]`
  - `buildBerangkatGroups(items: BerangkatItem[]): BerangkatGroup[]`
  - `cleanTourLeader(value: string | null | undefined): string | null`
  - `fmtTgl(d: string): string`
  - `fmtTglLong(d: string | null | undefined): string`
  - `fmtHariLagi(n: number | null): string`
  - tipe `DestinationFlag`, `BerangkatItem`, `BerangkatGroup` (dari `.d.ts`)

- [ ] **Step 1: Buat `lib/berangkat-groups.js` dengan memindahkan kode dari StatistikPage.tsx**

Pindahkan **verbatim** (tanpa mengubah perilaku) simbol-simbol berikut dari `src/components/StatistikPage.tsx`, buang anotasi tipe TypeScript-nya karena berkas tujuan adalah `.js`:

- `SAUDI_DESTINATION_FLAG` (konstanta)
- `EXTRA_DESTINATION_FLAGS` (array, termasuk seluruh `pattern` RegExp-nya — jangan ubah satu pun pola)
- `getDestinationFlags`
- `buildBerangkatGroups`
- `cleanTourLeader`
- `fmtTgl`, `fmtTglLong`, `fmtHariLagi`

Semua diekspor dengan `export`. Awali berkas dengan komentar:

```js
// Logika bersama kartu "Berangkat Mendatang" — dipakai StatistikPage (halaman
// Statistik) dan UpcomingSchedule (kartu kalender dashboard). Ditaruh di root
// lib/ sebagai ESM polos supaya bisa diuji langsung oleh tests/ dan di-import
// dari src/ lewat ../../lib/berangkat-groups.js (lihat lib/teras-linkify.js).
```

Catatan: `buildBerangkatGroups` memanggil `cleanTourLeader` — keduanya ada di berkas yang sama, jadi tidak perlu import.

- [ ] **Step 2: Buat `lib/berangkat-groups.d.ts`**

```ts
export interface DestinationFlag {
  code: string;
  label: string;
  src: string;
  fallback: string;
}

export interface BerangkatItem {
  nama: string;
  paket: string | null;
  jadwal_id?: string | null;
  tour_leader?: string | null;
  manasik_tgl?: string | null;
  manasik_jam?: string | null;
  berangkat_kode_penerbangan?: string | null;
  jk: string | null;
  tgl_berangkat: string;
  hari_lagi: number;
  lunas: boolean;
  sisa: number;
  wa: string | null;
}

export interface BerangkatGroup {
  key: string;
  paket: string;
  count: number;
  tour_leader: string | null;
  manasik_tgl: string | null;
  manasik_jam: string | null;
  tgl_berangkat: string;
  berangkat_kode_penerbangan: string | null;
  items: BerangkatItem[];
}

export function getDestinationFlags(paket: string | null | undefined): DestinationFlag[];
export function buildBerangkatGroups(items: BerangkatItem[]): BerangkatGroup[];
export function cleanTourLeader(value: string | null | undefined): string | null;
export function fmtTgl(d: string): string;
export function fmtTglLong(d: string | null | undefined): string;
export function fmtHariLagi(n: number | null): string;
```

- [ ] **Step 3: Tulis uji yang gagal**

Buat `tests/berangkat-groups.test.js`. Ikuti gaya berkas uji yang sudah ada — baca `tests/laporan-stats.test.js` lebih dulu dan tiru cara ia mendeklarasikan serta menjalankan uji (runner, cara assert, cara melaporkan hasil). Jangan mengarang runner baru.

Kasus yang wajib diuji:

```js
// 1. Mengelompokkan per jadwal_id
const items = [
  { nama: 'A', paket: 'UMROH REGULER', jadwal_id: 'J1', tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
  { nama: 'B', paket: 'UMROH REGULER', jadwal_id: 'J1', tgl_berangkat: '2026-08-05', jk: 'P', hari_lagi: 2, lunas: false, sisa: 5000000, wa: null },
];
// buildBerangkatGroups(items) → 1 grup, count === 2

// 2. jadwal_id null → kunci gabungan paket|tgl|kode; paket berbeda tidak menyatu
const items2 = [
  { nama: 'A', paket: 'PAKET X', jadwal_id: null, berangkat_kode_penerbangan: 'SV821', tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
  { nama: 'B', paket: 'PAKET Y', jadwal_id: null, berangkat_kode_penerbangan: 'SV821', tgl_berangkat: '2026-08-05', jk: 'L', hari_lagi: 2, lunas: true, sisa: 0, wa: null },
];
// buildBerangkatGroups(items2) → 2 grup

// 3. Urutan berdasarkan tgl_berangkat menaik
// items dengan tgl 2026-09-01 lalu 2026-08-05 → hasil[0].tgl_berangkat === '2026-08-05'

// 4. getDestinationFlags: tanpa kecocokan → Saudi
// getDestinationFlags('UMROH REGULER 9HR') → [{ code: 'sa', ... }]

// 5. getDestinationFlags: satu negara
// getDestinationFlags('PROMO PLUS DUBAI 11HR') → 1 flag, code 'ae'

// 6. getDestinationFlags: banyak negara, urut sesuai EXTRA_DESTINATION_FLAGS
// getDestinationFlags('PLUS DUBAI DAN TURKI') → 2 flag, code ['ae', 'tr']

// 7. cleanTourLeader membuang bullet dan merapatkan spasi
// cleanTourLeader('•  H. Ahmad') → 'H. Ahmad'
// cleanTourLeader('') → null
```

- [ ] **Step 4: Jalankan uji, pastikan GAGAL**

Jalankan berkas uji dengan cara yang sama seperti berkas uji lain di repo ini (lihat header `tests/laporan-stats.test.js`).
Harapan: GAGAL — modul `lib/berangkat-groups.js` belum ada atau ekspornya belum lengkap.

Jika ternyata langsung LULUS karena Step 1 sudah dikerjakan, itu wajar untuk refactor pemindahan — catat saja dan lanjut.

- [ ] **Step 5: Jalankan uji, pastikan LULUS**

Perbaiki sampai seluruh kasus lulus.

- [ ] **Step 6: Sambungkan StatistikPage.tsx ke modul baru**

Di `src/components/StatistikPage.tsx`:

1. Hapus definisi lokal: `SAUDI_DESTINATION_FLAG`, `EXTRA_DESTINATION_FLAGS`, `getDestinationFlags`, `buildBerangkatGroups`, `cleanTourLeader`, `fmtTgl`, `fmtTglLong`, `fmtHariLagi`, dan `interface DestinationFlag`, `interface BerangkatItem`, `interface BerangkatGroup`.
2. Tambahkan import:

```ts
import {
  getDestinationFlags, buildBerangkatGroups,
  fmtTgl, fmtTglLong, fmtHariLagi,
} from '../../lib/berangkat-groups.js';
import type { BerangkatItem, BerangkatGroup, DestinationFlag } from '../../lib/berangkat-groups.js';
```

3. `cleanTourLeader` di StatistikPage hanya dipakai oleh `buildBerangkatGroups` yang kini pindah. Jika setelah penghapusan tidak ada pemakai lain di berkas ini, jangan di-import — biarkan hilang. Jika masih ada pemakai, import juga.
4. Periksa: `DestinationFlag` mungkin tidak lagi dirujuk langsung di StatistikPage. Jika tidak, jangan di-import (impor tak terpakai = galat lint).

- [ ] **Step 7: Verifikasi build**

```bash
npm run build
```
Harapan: sukses, tanpa galat baru.

- [ ] **Step 8: Commit**

```bash
git add lib/berangkat-groups.js lib/berangkat-groups.d.ts tests/berangkat-groups.test.js src/components/StatistikPage.tsx
git commit -m "refactor(berangkat): ekstrak logika grup + bendera ke lib/berangkat-groups"
```

---

### Task 2: Endpoint `/api/calendar/berangkat-mendatang`

**Files:**
- Modify: `server.js` (sisipkan setelah endpoint `/api/calendar/insight-jamaah`)

**Interfaces:**
- Consumes: `buildBerangkatMendatang` (sudah di-import di `server.js:25`), `getWIBDateStr`, `fetchAllRows`, `getScheduleDetailMap`, `statsCacheGet`, `statsCacheSet`, `authMiddleware`, `supabase` — semuanya sudah ada di `server.js`.
- Produces: `GET /api/calendar/berangkat-mendatang` → `{ success: true, data: { berangkatBulanIni: BerangkatItem[], berangkatBulan: string | null } }`

- [ ] **Step 1: Sisipkan endpoint**

Letakkan tepat setelah blok `app.get('/api/calendar/insight-jamaah', ...)` berakhir, sebelum komentar `// API: Flight Status (AirLabs Integration)`.

```js
// ── API: Berangkat Mendatang (kartu kalender dashboard) ──
// Versi ringan dari bagian berangkatBulanIni milik /api/laporan/stats: hanya
// jamaah agen ini dalam 60 hari ke depan, tanpa metrik lain. Dipakai kartu
// UpcomingSchedule supaya dashboard tak perlu memanggil endpoint stats yang
// berat (±12 query paralel + di belakang dbLoadShedGuard).
app.get('/api/calendar/berangkat-mendatang', dbLoadShedGuard, authMiddleware, async (req, res) => {
  const agentId = req.user.id;
  try {
    const cacheKey = `berangkat:${agentId}`;
    const cached = statsCacheGet(cacheKey);
    if (cached) return res.json(cached);

    const todayStr = getWIBDateStr();
    const windowEnd = new Date(Date.parse(`${todayStr}T00:00:00Z`) + 60 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    // Sama seperti /api/laporan/stats: prospek yang belum bayar sepeser pun
    // tak ikut dihitung. TANPA filter hijriah_year — daftar ini operasional
    // dan melintasi batas tahun Hijriah (13 Jun 2026 = 1447H, 18 Jun = 1448H).
    const excludeBelumDP = (q) => q.or('bayar.gt.0,sisa.eq.0,sisa.is.null');
    const bebQ = supabase.from('jamaah')
      .select('nama, paket, jk, tgl_berangkat, sisa, bayar, wa, id_jadwal:raw_data->>id_jadwal')
      .eq('agent_id', agentId)
      .gte('tgl_berangkat', todayStr)
      .lte('tgl_berangkat', windowEnd)
      .order('tgl_berangkat', { ascending: true })
      .order('nama', { ascending: true });

    const [bebRows, scheduleDetailMap] = await Promise.all([
      fetchAllRows(excludeBelumDP(bebQ)),
      getScheduleDetailMap(),
    ]);

    const jadwalIds = [...new Set((bebRows || []).map(r => r.id_jadwal).filter(Boolean))];
    const calendarByJadwalId = new Map();
    if (jadwalIds.length > 0) {
      const { data: calRows, error: calErr } = await supabase
        .from('calendar_events')
        .select('jadwal_id, event_date, tour_leader')
        .eq('event_type', 'keberangkatan')
        .in('jadwal_id', jadwalIds);
      if (calErr) {
        console.warn('[BerangkatMendatang] calendar metadata fetch failed:', calErr.message);
      } else {
        for (const row of (calRows || [])) {
          if (!row.jadwal_id) continue;
          const current = calendarByJadwalId.get(row.jadwal_id);
          if (!current || String(row.event_date || '').localeCompare(String(current.event_date || '')) < 0) {
            calendarByJadwalId.set(row.jadwal_id, row);
          }
        }
      }
    }

    const enriched = (bebRows || []).map(r => ({
      ...r,
      jadwal_id: r.id_jadwal || null,
      jadwal_nama: scheduleDetailMap.get(r.id_jadwal)?.jadwal_nama || null,
      manasik_tgl: scheduleDetailMap.get(r.id_jadwal)?.manasik_tgl || null,
      manasik_jam: scheduleDetailMap.get(r.id_jadwal)?.manasik_jam || null,
      berangkat_kode_penerbangan: scheduleDetailMap.get(r.id_jadwal)?.berangkat_kode_penerbangan || null,
      tour_leader: calendarByJadwalId.get(r.id_jadwal)?.tour_leader || null,
    }));

    const { berangkatBulanIni, berangkatBulan } = buildBerangkatMendatang(enriched, todayStr);
    const payload = { success: true, data: { berangkatBulanIni, berangkatBulan } };
    statsCacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[BerangkatMendatang] Error:', err.message);
    res.status(500).json({ success: false, error: 'Gagal memuat berangkat mendatang' });
  }
});
```

- [ ] **Step 2: Verifikasi sintaks**

```bash
node --check server.js
```
Harapan: tanpa keluaran (lulus).

- [ ] **Step 3: Verifikasi nama helper benar-benar ada**

```bash
grep -n "function getWIBDateStr\|const getWIBDateStr\|async function fetchAllRows\|function fetchAllRows\|function statsCacheGet\|function statsCacheSet\|async function getScheduleDetailMap" server.js
```
Harapan: keenam simbol muncul. Jika salah satu tidak ada dengan nama itu, sesuaikan pemanggilan ke nama yang sebenarnya — jangan membuat helper baru.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(api): endpoint ringan /api/calendar/berangkat-mendatang"
```

---

### Task 3: Ekstrak komponen baris ke `src/components/berangkat/BerangkatGroupViews.tsx`

**Files:**
- Create: `src/components/berangkat/BerangkatGroupViews.tsx`
- Modify: `src/components/StatistikPage.tsx`

**Interfaces:**
- Consumes: `lib/berangkat-groups.js` (Task 1)
- Produces:
  - `<DestinationFlags paket={string} />`
  - `<BerangkatGroupSummaryRow group={BerangkatGroup} onSelect={(key: string) => void} />`
  - `<BerangkatGroupDetail group={BerangkatGroup} />`

- [ ] **Step 1: Buat berkas komponen bersama**

Pindahkan **verbatim** dari `src/components/StatistikPage.tsx` (cari berdasarkan nama fungsi, bukan nomor baris — nomor baris sudah bergeser oleh Task 1):

- `DestinationFlags`
- `BerangkatGroupSummaryRow`
- `BerangkatGroupDetail`
- `BerangkatRow`
- `GroupMeta`
- `WaIcon`
- `getInitials`

Ekspor hanya tiga yang pertama; sisanya tetap lokal di berkas ini.

Import yang dibutuhkan di berkas baru:

```ts
import { CalendarDays, Check, ChevronRight, Users } from 'lucide-react';
import { normalizeWaNumber } from '../../utils/phone';
import { getDestinationFlags, fmtTgl, fmtTglLong } from '../../../lib/berangkat-groups.js';
import type { BerangkatItem, BerangkatGroup, DestinationFlag } from '../../../lib/berangkat-groups.js';
```

**Perhatikan kedalaman path:** berkas ini ada di `src/components/berangkat/`, jadi root `lib/` berjarak **tiga** tingkat (`../../../lib/`), sedangkan `src/utils/` berjarak dua (`../../utils/`). Ini pernah salah sebelumnya — periksa ulang setelah menulis.

Awali berkas dengan komentar:

```tsx
// Komponen baris "Berangkat Mendatang" yang dipakai bersama oleh halaman
// Statistik dan kartu kalender dashboard. Satu salinan saja: kalau tampilan
// barisnya berubah, berubah di kedua layar sekaligus.
```

- [ ] **Step 2: Sambungkan StatistikPage.tsx**

1. Hapus definisi lokal `DestinationFlags`, `BerangkatGroupSummaryRow`, `BerangkatGroupDetail`, `BerangkatRow`, `GroupMeta`.
2. `WaIcon` dan `getInitials` masih dipakai `OutstandingRow` di StatistikPage — **biarkan** definisi lokalnya di sana. Berkas baru punya salinannya sendiri. (Menggabungkannya berarti menyentuh `OutstandingRow`, di luar ruang lingkup.)
3. Tambahkan import:

```ts
import { DestinationFlags, BerangkatGroupSummaryRow, BerangkatGroupDetail } from './berangkat/BerangkatGroupViews';
```

4. Buang import lucide-react yang jadi tak terpakai di StatistikPage (kemungkinan `CalendarDays`, mungkin `Check`). Jangan membuang yang masih dipakai — periksa dengan `grep` per nama sebelum menghapus.

- [ ] **Step 3: Verifikasi build**

```bash
npm run build
```
Harapan: sukses. Galat "declared but never read" berarti ada import sisa yang harus dibuang.

- [ ] **Step 4: Commit**

```bash
git add src/components/berangkat/BerangkatGroupViews.tsx src/components/StatistikPage.tsx
git commit -m "refactor(berangkat): komponen baris jadi komponen bersama"
```

---

### Task 4: Section Berangkat Mendatang di UpcomingSchedule

**Files:**
- Modify: `src/components/UpcomingSchedule.tsx`

**Interfaces:**
- Consumes: endpoint Task 2, `lib/berangkat-groups.js` (Task 1), komponen Task 3
- Produces: state `berangkatGroups`, `showAllGroups`, `selectedGroupKey` yang dipakai Task 5

- [ ] **Step 1: Tambahkan import**

```ts
import { buildBerangkatGroups } from '../../lib/berangkat-groups.js';
import type { BerangkatItem, BerangkatGroup } from '../../lib/berangkat-groups.js';
import { BerangkatGroupSummaryRow } from './berangkat/BerangkatGroupViews';
```

Tambahkan `Plane` ke daftar import `lucide-react` jika belum ada (di berkas ini `Plane` **sudah** di-import — periksa dulu, jangan menduplikasi).

- [ ] **Step 2: Tambahkan state dan fetch**

Di dalam `UpcomingSchedule()`, setelah state kalender yang sudah ada:

```ts
const [berangkatItems, setBerangkatItems] = useState<BerangkatItem[]>([]);
const [berangkatLabel, setBerangkatLabel] = useState<string>('');
const [berangkatLoading, setBerangkatLoading] = useState(true);
const [showAllGroups, setShowAllGroups] = useState(false);
const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

// Sekali saat mount — jendelanya tetap 60 hari ke depan dan TIDAK ikut
// navigasi bulan kalender, jadi tak ada dependensi ke currentMonth.
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const res = await fetch('/api/calendar/berangkat-mendatang', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (cancelled) return;
      setBerangkatItems(json?.data?.berangkatBulanIni || []);
      setBerangkatLabel(json?.data?.berangkatBulan || '');
    } catch {
      // Section ini pelengkap; kalau gagal, kartu kalender tetap utuh dan
      // section-nya tidak dirender sama sekali.
      if (!cancelled) { setBerangkatItems([]); setBerangkatLabel(''); }
    } finally {
      if (!cancelled) setBerangkatLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []);

const berangkatGroups = useMemo(() => buildBerangkatGroups(berangkatItems), [berangkatItems]);
const berangkatPreview = berangkatGroups.slice(0, 3);
const selectedGroup = useMemo(
  () => berangkatGroups.find(g => g.key === selectedGroupKey) || null,
  [berangkatGroups, selectedGroupKey],
);
```

- [ ] **Step 3: Render section di bawah legend**

Di dalam kartu, tepat setelah blok `{/* Legend */}` dan sebelum `</div>` penutup kartu:

```tsx
{/* ── Berangkat Mendatang (jendela tetap 60 hari; bukan turunan bulan aktif) ── */}
{berangkatLoading ? (
  <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3 space-y-3">
    {[0, 1, 2].map(i => (
      <div key={i} className="flex items-center gap-3">
        <div className="w-9 h-9 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-3/4 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
          <div className="h-2 w-1/2 rounded bg-gray-50 dark:bg-slate-700/60 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
) : berangkatGroups.length > 0 ? (
  <>
    <div className="px-4 pt-3 pb-2 border-t border-gray-100 dark:border-slate-700 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">
          Berangkat Mendatang
        </p>
        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
          {berangkatItems.length} jamaah · {berangkatGroups.length} paket{berangkatLabel ? ` · ${berangkatLabel}` : ''}
        </p>
      </div>
      <Plane size={15} className="shrink-0 text-blue-500 dark:text-blue-400" />
    </div>
    <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
      {berangkatPreview.map(group => (
        <BerangkatGroupSummaryRow key={group.key} group={group} onSelect={setSelectedGroupKey} />
      ))}
    </div>
    {berangkatGroups.length > berangkatPreview.length && (
      <button
        onClick={() => setShowAllGroups(true)}
        className="w-full py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-center gap-1"
      >
        Lihat lainnya <ChevronDown size={12} />
      </button>
    )}
  </>
) : null}
```

Tambahkan `ChevronDown` ke import `lucide-react` di berkas ini (belum ada — `ChevronLeft` dan `ChevronRight` sudah ada, `ChevronDown` belum).

- [ ] **Step 4: Jangan tampilkan section saat skeleton kalender**

Blok `if (loading && monthEvents.length === 0) return (<skeleton/>)` yang sudah ada mengembalikan kartu skeleton lebih awal. Biarkan apa adanya — section tidak muncul selama kalender masih skeleton, dan itu memang perilaku yang diinginkan.

- [ ] **Step 5: Verifikasi build**

```bash
npm run build
```
Harapan: sukses.

- [ ] **Step 6: Commit**

```bash
git add src/components/UpcomingSchedule.tsx
git commit -m "feat(dashboard): section Berangkat Mendatang di kartu kalender"
```

---

### Task 5: Bottom sheet detail paket dan daftar lengkap

**Files:**
- Modify: `src/components/UpcomingSchedule.tsx`

**Interfaces:**
- Consumes: state dari Task 4, `BerangkatGroupDetail` + `BerangkatGroupSummaryRow` dari Task 3
- Produces: (akhir rantai)

- [ ] **Step 1: Perluas kunci scroll body**

Ganti `useEffect` yang mengunci `document.body.style.overflow` agar ikut memperhitungkan dua sheet baru:

```ts
// Pakai selectedGroup (hasil pencarian), bukan selectedGroupKey mentah: kunci
// yang tak cocok dengan grup mana pun tidak boleh mengunci halaman tanpa ada
// sheet yang muncul. Syarat di sini harus sama persis dengan syarat render.
const anySheetOpen = selectedDay !== null || showAllGroups || !!selectedGroup;

useEffect(() => {
  if (anySheetOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
  return () => { document.body.style.overflow = ''; };
}, [anySheetOpen]);
```

Hapus `useEffect` lama yang hanya bergantung pada `selectedDay`. Jangan sisakan dua efek yang sama-sama menulis `document.body.style.overflow` — yang satu akan membatalkan yang lain.

- [ ] **Step 2: Tambahkan import komponen detail**

```ts
import { BerangkatGroupSummaryRow, BerangkatGroupDetail } from './berangkat/BerangkatGroupViews';
```
(gabungkan dengan import dari Task 4, jangan dua baris terpisah)

- [ ] **Step 3: Render dua sheet baru**

Tambahkan di dalam `<AnimatePresence>` yang sudah ada, setelah blok sheet tanggal, atau dalam `<AnimatePresence>` kedua — keduanya boleh, asal sheet tanggal dan sheet berangkat tidak saling menutup.

```tsx
<AnimatePresence>
  {(showAllGroups || selectedGroup) && (
    <>
      <motion.div
        key="berangkat-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => { setSelectedGroupKey(null); setShowAllGroups(false); }}
      />
      <motion.div
        key="berangkat-sheet"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 shadow-2xl max-h-[70vh] flex flex-col"
      >
        <div className="py-2 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>
        <div className="px-4 pb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-800 dark:text-white">
              {selectedGroup ? 'Detail Keberangkatan' : 'Berangkat Mendatang'}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
              {selectedGroup
                ? `${selectedGroup.count} jamaah · ${fmtTglLong(selectedGroup.tgl_berangkat)}`
                : `${berangkatGroups.length} paket${berangkatLabel ? ` · ${berangkatLabel}` : ''}`}
            </p>
          </div>
          <button
            onClick={() => { setSelectedGroupKey(null); setShowAllGroups(false); }}
            className="w-8 h-8 shrink-0 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {selectedGroup ? (
            <BerangkatGroupDetail group={selectedGroup} />
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {berangkatGroups.map(group => (
                <BerangkatGroupSummaryRow key={group.key} group={group} onSelect={setSelectedGroupKey} />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )}
</AnimatePresence>
```

Tambahkan `fmtTglLong` ke import dari `../../lib/berangkat-groups.js`.

Catatan perilaku yang disengaja: saat sheet daftar terbuka lalu satu baris ditekan, `selectedGroupKey` terisi sehingga isi sheet berganti ke detail **tanpa** sheet tertutup dulu. Tombol tutup mengosongkan keduanya sekaligus.

- [ ] **Step 4: Verifikasi build**

```bash
npm run build
```
Harapan: sukses.

- [ ] **Step 5: Verifikasi tidak ada galat tsc baru**

```bash
npx tsc --noEmit 2>&1 | tail -20
```
Proyek ini sudah punya ±6 galat tsc bawaan. Yang dinilai: **tidak ada galat baru** yang menyebut `UpcomingSchedule.tsx`, `BerangkatGroupViews.tsx`, atau `berangkat-groups`.

- [ ] **Step 6: Commit**

```bash
git add src/components/UpcomingSchedule.tsx
git commit -m "feat(dashboard): bottom sheet detail paket & daftar berangkat mendatang"
```

---

## Verifikasi akhir (dijalankan pemilik rencana, bukan subagent)

```bash
node --check server.js
npm run build
```

Daftar periksa manual untuk pemilik repo (butuh deploy `server.js` lebih dulu):

- [ ] Buka `/dashboard` — section muncul di bawah legend kalender
- [ ] Angka ringkasan cocok dengan kartu Berangkat Mendatang di tab Statistik
- [ ] Navigasi bulan kalender **tidak** mengubah isi section
- [ ] Tap satu baris → sheet detail; tour leader, penerbangan, manasik terisi
- [ ] Tap "Lihat lainnya" → sheet daftar; tap baris di dalamnya → berganti ke detail
- [ ] Tutup sheet → halaman bisa digulir lagi
- [ ] Mode gelap: kontras teks dan pemisah terbaca
- [ ] Agen tanpa keberangkatan 60 hari ke depan → section tidak muncul, kalender normal
