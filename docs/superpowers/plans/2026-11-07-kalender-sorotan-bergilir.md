# Sorotan Bergilir Kalender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gelembung "Sorotan Bergilir" yang singgah otomatis di tanggal-tanggal berjadwal saat kartu kalender Dashboard terlihat.

**Architecture:** Semua keputusan murni (urutan tanggal, isi gelembung, mesin status, posisi, gerbang harian) di `src/lib/calendarSpotlight.ts`, diuji unit lewat esbuild. Komponen `CalendarSpotlight.tsx` hanya merender + timer + listener; `UpcomingSchedule.tsx` memegang state (reducer) dan pemicu IntersectionObserver.

**Tech Stack:** React 18, TypeScript, Tailwind, framer-motion 12.43, lucide-react, node:test + esbuild.

**Spec:** `docs/superpowers/specs/2026-11-07-kalender-sorotan-bergilir-design.md`

## Global Constraints

- Tanpa endpoint/kolom/migrasi baru; tanpa dependensi baru.
- `SPOTLIGHT_DWELL_MS = 3000`, `SPOTLIGHT_AUTO_STOPS = 6`, gerbang `localStorage['calendar-spotlight-v1'] = 'YYYY-MM-DD'` (WIB).
- Hari ini = `wibTodayKey()` (`lib/manasik-sessions.js`). Grid lama tetap jam lokal.
- Tanpa avatar, tanpa Hijriah, tanpa foto. Nama TL wajib. Teks jamaah: `3 jamaah Anda berangkat · Kloter 12`, `5 jamaah Anda ikut manasik`.
- Kata "pax" hanya untuk angka kloter; "jamaah Anda" hanya untuk milik agent.
- Posisi/lebar/keterlihatan gelembung lewat `style` inline; kelas warna yang sudah ada di build lama.
- `npx tsc --noEmit` harus tetap 0 error (baseline 2026-11-07 = 0). `tests/upcoming-schedule-*.test.js` tetap hijau.
- Commit langsung di `main`, `git add` per berkas, cek `git branch --show-current` sebelum commit.

## Review Focus

1. Bulan dengan semua jadwal sudah lewat / agent membuka bulan lain → tidak ada putaran, tidak ada "Sorot lagi" (Task 2: `buildSpotlightDates` kosong).
2. `localStorage` melempar (Safari private) → putaran tetap jalan sekali per sesi halaman, tidak tiap render (Task 2: tes gerbang dengan storage melempar).
3. Detail tanpa `jam`/`pesawat`/`tour_leader` (data legacy bolong) → baris terkait hilang, tidak ada "undefined"/"TL " kosong (Task 3: tes detail minim).
4. Tanggal di kolom paling kanan/kiri dan baris bawah di layar sempit → gelembung tidak keluar kartu ke samping, ekor tetap menunjuk tanggal (Task 2: tes `computeBubblePosition`).
5. Agent menekan ‹ › berulang sampai ujung → tidak melampaui daftar, tombol ujung nonaktif (Task 2: tes reducer `go`).

---

### Task 1: Ekstrak helper event kalender bersama

**Files:**
- Create: `src/lib/calendarEvents.ts`
- Modify: `src/components/UpcomingSchedule.tsx` (hapus definisi lokal, ganti import)
- Modify: `lib/flight-segments.js` (ekspor `extractCalendarParts`)

**Interfaces:**
- Produces (`src/lib/calendarEvents.ts`):
  - `type CalendarEventType = 'manasik' | 'keberangkatan' | 'kepulangan'`
  - `interface EventDetail` (persis field yang sekarang di UpcomingSchedule)
  - `interface CalendarEvent { date: string; type: CalendarEventType; details: EventDetail[] }`
  - `displayPax(d: EventDetail): number`, `hasDisplayableDetail(d: EventDetail): boolean`,
    `parsePaket(paket: string | null): { name: string; departure: string | null }`, `SHORT_MONTHS: string[]`
- Produces (`lib/flight-segments.js`): `export function extractCalendarParts(pesawat): { airline: string; codePart: string }` (tubuh tidak berubah).

- [ ] **Step 1:** Pindahkan definisi di atas apa adanya (komentar ikut) ke `calendarEvents.ts`; `UpcomingSchedule.tsx` mengimpornya. Pemanggilan `{displayPax(detail)}`, `parsePaket(detail.paket)` di komponen tidak diubah.
- [ ] **Step 2:** Tambah `export` pada `extractCalendarParts` di `lib/flight-segments.js`.
- [ ] **Step 3:** Run `node --test tests/upcoming-schedule-itinerary.test.js tests/upcoming-schedule-mutawif.test.js tests/flight-segments*.test.js` → PASS; `npx tsc --noEmit` → 0 error.
- [ ] **Step 4:** Commit `refactor(kalender): helper event kalender dipakai bersama`.

### Task 2: Model sorotan — tanggal, jamaah Anda, gerbang, reducer, posisi

**Files:**
- Create: `src/lib/calendarSpotlight.ts`
- Test: `tests/calendar-spotlight.test.js` (bundle `src/lib/calendarSpotlight.ts` dengan esbuild, pola `tests/jadwal-availability-hint.test.js`)

**Interfaces:**
- Consumes: Task 1 types; `BerangkatGroup` (`lib/berangkat-groups.js`), `ManasikSession` (`lib/manasik-sessions.js`), `realDateKey`.
- Produces:
  - `SPOTLIGHT_DWELL_MS`, `SPOTLIGHT_AUTO_STOPS`, `SPOTLIGHT_GATE_KEY`
  - `interface SpotlightMine { berangkat: Map<string, { count: number; jadwalIds: string[] }>; manasik: Map<string, { count: number; jadwalIds: string[] }> }`
  - `buildSpotlightMine(groups: readonly BerangkatGroup[], sessions: readonly ManasikSession[]): SpotlightMine` (kunci = `realDateKey(tgl_berangkat)` / `manasik_tgl`; manasik `jadwalIds` dari `session.groups[].jadwal_id`)
  - `buildSpotlightDates(a: { events: readonly CalendarEvent[]; year: number; month: number; todayKey: string; mine: SpotlightMine }): string[]`
  - `canAutoStartSpotlight(todayKey: string, storage?: SpotlightStorage | null): boolean`; `markSpotlightShown(todayKey: string, storage?: SpotlightStorage | null): void`; `interface SpotlightStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }`
  - `type SpotlightMode = 'auto' | 'manual' | 'hover'`; `interface SpotlightState { mode: SpotlightMode; dates: string[]; index: number; shown: number; trigger: 'auto' | 'replay' | 'hover' }`
  - `type SpotlightAction = { type: 'start'; dates: string[]; trigger: 'auto' | 'replay'; reducedMotion: boolean } | { type: 'advance' } | { type: 'go'; delta: -1 | 1 } | { type: 'hover'; date: string } | { type: 'hoverEnd' } | { type: 'dismiss' }`
  - `spotlightReducer(state: SpotlightState | null, action: SpotlightAction): SpotlightState | null`
  - `computeBubblePosition(a: { cell: { top: number; bottom: number; left: number; right: number }; wrapperWidth: number; wrapperHeight: number; viewportTop: number; viewportBottom: number; bubbleHeight: number }): { left: number; top: number; width: number; arrowLeft: number; placement: 'below' | 'above' }` (semua koordinat relatif ke pembungkus)

- [ ] **Step 1: Tes gagal** — `tests/calendar-spotlight.test.js` dengan kasus (TODAY `2026-11-07`, events November 2026 seperti mockup: 3P, 5B, 7PM, 9B, 12P, 14BM, 16B, 18P, 21BM, 23P, 25B, 28BP, 30P; satu detail kosong-semua di 20 Nov yang tidak boleh dihitung):
  - `buildSpotlightDates` dengan mine berangkat {9,14,21} + manasik {7,14} → `['2026-11-07','2026-11-09','2026-11-14','2026-11-21','2026-11-12','2026-11-16','2026-11-18','2026-11-23','2026-11-25','2026-11-28','2026-11-30']` (11, tanggal 3 & 5 & 20 tidak ada).
  - Mine di tanggal tanpa event (mis. 19) tidak menambah tanggal.
  - `month: 12` atau `todayKey: '2026-12-01'` → `[]`.
  - Gerbang: storage memori → `canAutoStart` true, setelah `markSpotlightShown` false untuk hari yang sama, true untuk hari berikutnya; storage yang `getItem/setItem` melempar → true sekali, setelah mark false (cadangan memori modul).
  - Reducer: `start` 11 tanggal → `{mode:'auto', index:0, shown:1}`; `start` dengan `reducedMotion:true` → mode `'manual'`; `start` dengan `[]` → `null`; 5× `advance` → index 5, shown 6; `advance` ke-6 → `null`; `advance` di mode manual → state sama; `go +1` dari auto → mode `'manual'`, index+1; `go -1` di index 0 → state sama; `go +1` di index terakhir → state sama; `hover` → `{mode:'hover', dates:[date], index:0}`; `hoverEnd` saat mode bukan hover → state sama; `dismiss` → `null`.
  - `computeBubblePosition` (wrapper 358×600, viewport 0..800, bubbleHeight 180): sel kolom kanan `{left:298,right:346,top:74,bottom:120}` → `width 244`, `left 106`, `placement 'below'`, `top 126`, `arrowLeft 216`; sel kolom kiri `{left:12,right:60,...}` → `left 8`, `arrowLeft 28`; viewportBottom 300 dengan sel `{top:220,bottom:266}` → `'above'`, `top 220+2-6-180 = 36`; wrapperWidth 240 → `width 224`.
- [ ] **Step 2:** Run `node --test tests/calendar-spotlight.test.js` → FAIL (modul belum ada).
- [ ] **Step 3:** Implement fungsi di atas di `src/lib/calendarSpotlight.ts`. Posisi: `width = min(244, W − 16)`; `left = clamp(cx − width/2, 8, W − width − 8)`; `arrowLeft = clamp(cx − left, 16, width − 16)`; `spaceBelow = min(wrapperHeight, viewportBottom) − cell.bottom`, `spaceAbove = cell.top − max(0, viewportTop)`; bawah bila `spaceBelow ≥ h + 12 || spaceAbove < spaceBelow` → `top = cell.bottom + 6`; atas → `top = cell.top + 2 − 6 − h`. Gerbang: cadangan `let memoryShownDay: string | null`; storage default `window.localStorage` dalam try/catch.
- [ ] **Step 4:** Run tes → PASS.
- [ ] **Step 5:** Commit `feat(kalender): model sorotan bergilir (urutan, gerbang, posisi)`.

### Task 3: Isi gelembung

**Files:**
- Modify: `src/lib/calendarSpotlight.ts`
- Test: `tests/calendar-spotlight.test.js`

**Interfaces:**
- Consumes: Task 1 & 2; `formatCalendarPrimaryPerson` (`src/lib/calendarPeople.ts`), `formatTerminal` (`src/lib/calendarTerminal.ts`), `extractCalendarParts`.
- Produces:
  - `type SpotlightIcon = 'takeoff' | 'landing' | 'clock' | 'tl' | 'staff' | 'manasik'`
  - `interface SpotlightLine { icon: SpotlightIcon | null; text: string }`
  - `interface SpotlightSection { type: CalendarEventType; title: string; lines: SpotlightLine[] }`
  - `interface SpotlightContent { date: string; day: number; dayLabel: string; badge: { text: string; tone: 'today' | CalendarEventType } | null; sections: SpotlightSection[]; mine: { type: 'keberangkatan' | 'manasik'; text: string }[] }`
  - `buildSpotlightContent(a: { date: string; events: readonly CalendarEvent[]; todayKey: string; mine: SpotlightMine }): SpotlightContent | null` (null bila tidak ada detail tampil)

- [ ] **Step 1: Tes gagal** — kasus dengan fixture (pesawat format `'SAUDIA ~ SV 817'`):
  - 9 Nov, 3 kloter berangkat (SAUDIA SV 817 06:45 pax_terisi 138, GARUDA INDONESIA GA 980 10:20 pax 92, LION AIR JT 112 22:10 pax_terisi 182; TL `'• Ust. Ridwan Hakim'` di kloter 12 jadwal `J12`, TL lain di dua kloter), mine berangkat `{count:3, jadwalIds:['J12']}` →
    `dayLabel 'SEN, 9 NOV'`, `badge {text:'H-2', tone:'keberangkatan'}`, satu section `title '3 kloter berangkat'`, lines `[{icon:'takeoff', text:'Saudia · Garuda Indonesia +1'}, {icon:'clock', text:'Take off 06:45–22:10 · 412 pax'}, {icon:'tl', text:'TL Ust. Ridwan Hakim +2'}]`, mine `[{type:'keberangkatan', text:'3 jamaah Anda berangkat · Kloter 12'}]`.
  - 1 kloter berangkat → takeoff `'Saudia SV 817'`, clock `'Take off 06:45 · 138 pax'`.
  - 7 Nov (hari ini) pulang 1 kloter (SV 816, jam `'14.30'`, arrival_terminal `'3'`, staff `'Joko Santoso'`) + manasik 1 detail (jam `'08:00'`, paket `'14/11/2026UMROH PLUS'`), mine manasik 4 → badge `{text:'HARI INI', tone:'today'}`, dua section berurutan kepulangan lalu manasik; kepulangan lines `[{icon:null,text:'SV 816 · tiba 14:30 · T3'}, ...]` (multi = tanpa ikon), manasik title `'Manasik 08:00'`, line `'Untuk keberangkatan 14 Nov'`; mine `[{type:'manasik', text:'4 jamaah Anda ikut manasik'}]`.
  - Pulang tunggal → lines `landing 'Saudia SV 816 · tiba 14:30 · T3'`, `tl …` bila ada, `staff 'Dijemput staff Joko Santoso'`.
  - Mine manasik ada tapi tanggal tanpa event manasik → tidak ada baris mine manasik.
  - Detail minim (hanya `group_number`, tanpa pesawat/jam/TL, pax 0) → section `'1 kloter berangkat'` tanpa baris takeoff/clock/tl; tidak ada string yang memuat `undefined`, `null`, atau `'TL '` berakhiran kosong.
  - Badge: `BESOK` untuk H-1; tanggal lewat → `null`.
  - Manasik dua tanggal berangkat 14 & 21 Nov → `'Untuk keberangkatan 14 & 21 Nov'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `buildSpotlightContent`. Aturan string persis spec §5.1–5.5. Jam dinormalisasi `/(\d{1,2})[:.](\d{2})/` → `HH:MM`. Nama maskapai title-case per kata. Terminal pulang `formatTerminal(arrival_terminal)` lalu `Terminal ` → `T`. TL `formatCalendarPrimaryPerson(tour_leader, 3)`. Hari dalam minggu dihitung dari tanggal UTC kunci (bukan jam lokal).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(kalender): isi gelembung sorotan per jenis jadwal`.

### Task 4: Komponen gelembung

**Files:**
- Create: `src/components/calendar/CalendarSpotlight.tsx`

**Interfaces:**
- Consumes: Task 2 & 3.
- Produces: `export default function CalendarSpotlight(p: { wrapperRef: RefObject<HTMLDivElement>; state: SpotlightState; content: SpotlightContent; reducedMotion: boolean; onAdvance(): void; onGo(delta: -1 | 1): void; onOpenDetail(): void; onDismiss(): void; onPointerEnter?(): void; onPointerLeave?(): void })`

- [ ] **Step 1:** Render sesuai A2/A3: latar `bg-slate-900 dark:bg-slate-950`, garis tepi `dark:border dark:border-slate-700`, sudut `rounded-2xl` (14 px lewat style), ekor = kotak 12×12 diputar 45° berwarna sama di `arrowLeft`. Section tunggal: judul 16 px; campuran: titik `TAB_CONFIG` warna + judul 13 px. Kotak jamaah Anda: `bg-emerald-500/15` / `bg-violet-500/15`, teks `text-emerald-300` / `text-violet-300`. Kaki: ‹ `n/total` › (nonaktif di ujung, `aria-label` "Tanggal sebelumnya"/"Tanggal berikutnya") + `Detail ›`; mode hover hanya Detail. Garis waktu hanya di mode auto & bukan reducedMotion.
- [ ] **Step 2:** Posisi: `useLayoutEffect` ukur tinggi gelembung + rect sel `[data-cal-day="<day>"]` di `wrapperRef`, panggil `computeBubblePosition`; ulang saat `content.date` berubah, ResizeObserver pembungkus, dan `scroll` jendela (pasif, satu kali per rAF). Sebelum terukur: `visibility:hidden`.
- [ ] **Step 3:** Timer: `useMotionValue(0)` + `animate(mv, 1, { duration: SPOTLIGHT_DWELL_MS/1000, ease: 'linear' })`, reset per `content.date`; `pause()` saat pointer di atas/menekan atau fokus di dalam, `play()` saat lepas; selesai → `onAdvance()`.
- [ ] **Step 4:** Tutup: `pointerdown` di `document` (capture) di luar gelembung → `onDismiss`; `keydown` Escape di `document` → `preventDefault()` + `onDismiss`. Klik badan gelembung (selain tombol ‹ ›) dan Detail → `onOpenDetail`.
- [ ] **Step 5:** Gerak: masuk skala 0,94→1 + opacity 220 ms dengan `transformOrigin` di ekor; pindah = animasi `left/top` spring (`stiffness 420, damping 40`), isi `AnimatePresence mode="popLayout"` opacity 120 ms; keluar opacity + y 4 px 180 ms. reducedMotion → tanpa skala/spring.
- [ ] **Step 6:** `npx tsc --noEmit` → 0 error. Commit `feat(kalender): komponen gelembung sorotan`.

### Task 5: Pasang di kartu kalender + analitik

**Files:**
- Modify: `src/components/UpcomingSchedule.tsx`
- Modify: `server.js` (`FEATURE_LABELS`)

**Interfaces:**
- Consumes: Task 2–4.

- [ ] **Step 1:** Struktur: kartu dibungkus `<div ref={wrapperRef} className="relative">`; bagian header→legenda dibungkus `<div ref={calendarRef}>`; tiap sel tanggal dapat `data-cal-day={day}`. Sel aktif (`state.dates[state.index]` di bulan tampil) dapat cincin `ring-2 ring-emerald-500` (hari ini: `ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-800`).
- [ ] **Step 2:** State: `useReducer(spotlightReducer, null)`; `mine = useMemo(buildSpotlightMine(berangkatGroups, manasikSessions))`; `todayKey = wibTodayKey()`; `dates = useMemo(buildSpotlightDates(...))` untuk bulan tampil; `ready = calendarData[key] && !berangkatLoading && !monthError`.
- [ ] **Step 3:** Pemicu: IntersectionObserver pada `calendarRef`, threshold `[0, 0.2, 0.6]`. Rasio ≥0.6 + `ready` + `dates.length` + `!anySheetOpen` + `!state` + `canAutoStartSpotlight(todayKey)` → dispatch `start` (`trigger:'auto'`, `reducedMotion` dari `useReducedMotion()`), `markSpotlightShown(todayKey)`, `trackEvent('feature','view_calendar_spotlight',{trigger, stops: dates.length, mine: <ada mine di dates>})`. Rasio <0.2 saat aktif → `dismiss`. Ganti bulan (`prevMonth/nextMonth`) dan `anySheetOpen` → `dismiss`.
- [ ] **Step 4:** Hover desktop (`matchMedia('(hover: hover) and (pointer: fine)')`): `onMouseEnter` sel berjadwal → `hover` (tanggal bulan tampil); `onMouseLeave` sel/gelembung → `hoverEnd` setelah 150 ms (dibatalkan bila masuk lagi).
- [ ] **Step 5:** Detail: `setSelectedDay(day)` + `trackEvent('feature','open_calendar_day',{has_departure, source:'spotlight'})` + `dismiss`. Tombol "Sorot lagi" (ikon `RotateCcw`, teks 8–9 px, `bg-emerald-50 text-emerald-600`) di kanan legenda bila bulan berjalan tampil, `ready`, `dates.length`, dan `!state` → `start` dengan `trigger:'replay'` + event analitik.
- [ ] **Step 6:** `server.js` `FEATURE_LABELS`: `view_calendar_spotlight: 'Kalender: Sorotan Tanggal'`.
- [ ] **Step 7:** Verifikasi: `npx tsc --noEmit` → 0; `npm run build` sukses; `node --test tests/calendar-spotlight.test.js tests/upcoming-schedule-itinerary.test.js tests/upcoming-schedule-mutawif.test.js tests/manasik-sessions.test.js tests/berangkat-groups.test.js` → PASS; `node --check server.js`.
- [ ] **Step 8:** Cek visual di dev server lokal bila sesi agent tersedia; susun checklist manual untuk user.
- [ ] **Step 9:** Commit `feat(kalender): sorotan bergilir di kartu kalender dashboard`.
