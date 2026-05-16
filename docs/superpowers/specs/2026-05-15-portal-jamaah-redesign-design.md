# Portal Jamaah Redesign — Design Spec

**Status:** Draft → awaiting user review
**Date:** 2026-05-15
**Scope:** Complete UI/UX overhaul of `/[slug]/jamaah/dashboard` (Portal Jamaah) — all tabs + shared components.

---

## Context

Portal Jamaah saat ini ([src/components/portal-jamaah/](../../src/components/portal-jamaah/)) dipakai jamaah (mayoritas usia 40+) untuk monitor persiapan umroh mereka: pembayaran, dokumen, perlengkapan, jadwal manasik, itinerary, dan flight info. Implementasi sekarang:

- 4 tab dengan bottom navigation (Beranda, Perjalanan, Bayar, Persiapan)
- Light-mode only (`document.documentElement.classList.remove('dark')`)
- Typography banyak `text-[10px]`/`text-[11px]` → terlalu kecil untuk presbiopia age 40+
- Tidak konsisten dengan [DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md): pakai `bg-slate-50` (vs `bg-gradient-to-b from-gray-50 to-gray-100`), `border-slate-100` (vs `border-gray-100`), `emerald-700` solid (vs `emerald-500` + shadow), `max-w-md` (vs `max-w-lg`), no `backdrop-blur-md` top bar.
- Bottom nav 4-slot tidak extensible — sulit nambah menu di masa depan.

## Goals

1. **Visual parity with DESIGN-SYSTEM.md** — semua color/spacing/shadow ikut spec resmi.
2. **Senior-friendly typography** — minimum readable size 13px, hero stat lebih besar.
3. **Menu pattern seperti agent dashboard** — 3-col grid feature cards (extensible), ganti bottom nav.
4. **Dark mode support** — sesuai DESIGN-SYSTEM, dengan toggle di top bar.
5. **Hybrid visual direction** — hero spiritual emerald (warm), menu cards semantic colors per fitur (visual scanning).

## Non-Goals

- Backend changes / new API endpoints
- New data fields beyond current `usePortalMe()` and `usePortalPersiapan()` payloads
- Notification system (bell button dummy → removed for now, real notifs out of scope)
- FAQ content management (static hardcoded array, no admin CMS)
- A/B testing or analytics for the redesign

---

## Information Architecture

### Top-level routes (intra-app state, not URL)

```
Beranda (default landing)
├─ Perjalanan       [emerald]
├─ Pembayaran       [blue]
├─ Dokumen          [amber]
├─ Perlengkapan     [violet]
├─ Manasik & Spiritual [purple]
└─ FAQ & Bantuan    [rose]
```

`PortalDashboard` state becomes `activeRoute: 'beranda' | 'perjalanan' | 'pembayaran' | 'dokumen' | 'perlengkapan' | 'manasik' | 'faq'`. Bottom nav (`PortalBottomNav`) removed. Navigation entirely via:
- Menu grid on Beranda → sub-page
- Sticky back button on sub-page → Beranda

WhatsApp "Hubungi Agent" tidak jadi menu card — di-implement sebagai **sticky bottom CTA** yang persist di SEMUA route (Beranda + sub-pages). Lebih important sebagai always-accessible safety net untuk jamaah 40+ yang sering butuh konfirmasi langsung.

### Sub-page migrations

Existing `PersiapanTab` dengan 4 sub-tabs (Tahapan, Spiritual, Dokumen, Perlengkapan) di-decompose:

| Existing | New location |
|---|---|
| `PersiapanTab → TahapanSubTab` | → Beranda widget "Yang perlu Anda lakukan" (top-3 task aktif) |
| `PersiapanTab → SpiritualSubTab` | → `ManasikSpiritualPage` (combined dengan manasik info) |
| `PersiapanTab → DokumenSubTab` | → `DokumenPage` (top-level) |
| `PersiapanTab → PerlengkapanSubTab` | → `PerlengkapanPage` (top-level) |
| `PerjalananTab` | → `PerjalananPage` (redesigned) |
| `BayarTab` | → `PembayaranPage` (redesigned) |
| `BerandaTab` | → `BerandaPage` (redesigned, lots of new widgets) |
| (new) | → `FaqPage` (static accordion) |

---

## Visual Specs

### Typography (overrides for 40+ audience)

| Element | DESIGN-SYSTEM default | Portal override | Rationale |
|---|---|---|---|
| Section header | `text-xs` (12px) | `text-[13px]` | More readable |
| Caption/meta | `text-[10-11px]` | `text-xs` (12px) minimum | 10–11px too small for presbyopia |
| Hero stat (countdown) | `text-2xl` | `text-6xl` | Celebrate moment, large impact |
| Button label | `text-sm font-bold` | unchanged (14px) | Already adequate |
| Body text | `text-sm` (14px) | unchanged | Already adequate |
| Badge | `text-[9px]` | `text-[11px]` minimum | 9px unreadable |

Touch targets minimum **48×48px** (icon buttons `w-12 h-12`, primary CTAs `py-3.5`).

### Color & Layout

Per [DESIGN-SYSTEM.md → Layout](../../DESIGN-SYSTEM.md):

```
min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950
└─ <header sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50>
└─ <main className="max-w-lg mx-auto px-4 pt-5 pb-24">  (pb-24 to clear sticky WA)
└─ <footer fixed bottom-0 ... sticky WA CTA>
```

### Hero Countdown (Beranda)

Pattern mengikuti `HajiPlusPage` hero card di DESIGN-SYSTEM line 100-108:

```
background: linear-gradient(135deg, #064e3b 0%, #0F6E56 50%, #065f46 100%)
border-radius: rounded-2xl (1rem)
padding: p-6
```

Content:
- Top-right: badge `bg-white/15 backdrop-blur` berisi `id_umroh`
- Center-left: label `Menuju Tanah Suci` (text-xs uppercase tracking-wider text-emerald-50), angka `{daysLeft}` text-6xl font-bold, suffix `hari lagi` text-sm
- Bottom: divider `border-t border-white/20`, grid 2-col: Paket | Penerbangan, label uppercase tiny + value text-sm font-semibold

Decorative: skip (no SVG pattern — keep hero clean & minimal, gradient sudah cukup).

### Smart Alerts Strip (Beranda)

Muncul conditional, **max 2 alerts** visible (jika >2 trigger, prioritas urut: payment → dokumen → perlengkapan → manasik. Sisanya disembunyikan):

| Alert | Trigger condition | Color |
|---|---|---|
| Pembayaran belum lunas H-30 | `daysLeft ≤ 30 && totalSisa > 0` | `bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300` |
| Dokumen belum lengkap H-60 | `daysLeft ≤ 60 && hasMissingCriticalDoc()` | `bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300` |
| Perlengkapan belum diambil H-14 | `daysLeft ≤ 14 && hasUntakenEquipment()` | `bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/40 text-violet-700 dark:text-violet-300` |
| Manasik dalam 7 hari | `manasikDaysLeft ≤ 7 && manasikDaysLeft >= 0` | `bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/40 text-purple-700 dark:text-purple-300` |

Format alert: icon kiri (sesuai kategori) + judul `text-sm font-bold` + 1 baris subtitle `text-xs` + CTA chevron right (tap → navigate ke menu terkait).

Helpers `hasMissingCriticalDoc()` & `hasUntakenEquipment()` di-implement di hook utility, kriteria:
- **Critical doc** = paspor, visa, vaksin meningitis (3 dokumen wajib minimum)
- **Untaken equipment** = `Object.values(perlengkapan).some(p => p.status !== 'diambil')` minimal 1 item

### Menu Grid (Beranda)

Clone pattern dari [DashboardLayout.tsx:691-752](../../src/components/DashboardLayout.tsx) `renderMenuCard`, dengan adjustment:
- Icon size **24px** (current 22px) — slight bump for readability
- Icon container **w-12 h-12** (current w-11 h-11) — 48px touch target
- Label `text-[13px]` (current 12px)
- **Hapus** icon animation classes (`animate-icon-float`, `animate-icon-breathe`, dst) — too "ramai" untuk audience 40+, pakai `hover:scale-110` static saja
- Description text per card: tampilkan **1 baris pendek di bawah label** (e.g., "Lihat flight & hotel" untuk Perjalanan). Hanya di home grid. Beda dari agent dashboard yang tidak render desc — untuk audience 40+, label saja kurang context, perlu helper text.

Card color map:

| Menu | Icon (lucide) | iconBg gradient | cardBg gradient | Desc text (1 baris) |
|---|---|---|---|---|
| Perjalanan | `Plane` | `from-emerald-400 to-teal-600` | `from-emerald-50 via-white to-teal-100/70` | Flight & hotel |
| Pembayaran | `CreditCard` | `from-sky-400 to-indigo-600` | `from-sky-50 via-white to-indigo-100/70` | Cicilan & bukti |
| Dokumen | `FileText` | `from-amber-400 to-orange-500` | `from-amber-50 via-white to-orange-100/70` | Paspor, visa, dll |
| Perlengkapan | `Package` | `from-violet-400 to-purple-600` | `from-violet-50 via-white to-purple-100/70` | Koper, ihram, dll |
| Manasik & Spiritual | `BookOpenCheck` | `from-purple-400 to-fuchsia-600` | `from-fuchsia-50 via-white to-purple-100/70` | Jadwal & persiapan ibadah |
| FAQ & Bantuan | `HelpCircle` | `from-rose-400 to-pink-600` | `from-rose-50 via-white to-pink-100/70` | Pertanyaan umum |

Dark mode variants per DESIGN-SYSTEM (line 53-66): `dark:from-{color}-950/40 dark:via-slate-800 dark:to-slate-800` untuk cardBg.

### "Yang Perlu Anda Lakukan" Widget (Beranda)

Section di bawah menu grid, header `text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400`.

Logic: dari `usePortalPersiapan().persiapan.tahapan`, ambil top-3 item dengan `status === 'pending'` atau `belum_selesai`. Format:
- Card per task: `rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm p-4 flex items-center gap-3`
- Icon kiri (w-10 h-10 rounded-lg): warna sesuai kategori task:
  - kategori `pembayaran` → `bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400` (CreditCard)
  - kategori `dokumen` → `bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400` (FileText)
  - kategori `perlengkapan` → `bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400` (Package)
  - kategori `manasik`/`spiritual` → `bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400` (BookOpenCheck)
  - fallback → `bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-400` (Circle)
- Center: title `text-sm font-bold` + due date `text-xs text-gray-500 dark:text-slate-400`
- Right: ChevronRight 16px → navigate ke menu terkait sesuai kategori

Kategori diturunkan dari field `tahapan.kind` (existing). Mapping kind → kategori UI:
- `bayar*`, `pembayaran*` → pembayaran
- `dokumen*`, `paspor*`, `visa*` → dokumen
- `perlengkapan*`, `koper*`, `ihram*` → perlengkapan
- `manasik*`, `spiritual*`, `doa*`, `niat*` → manasik
- lainnya → fallback

Kalau tidak ada pending: single card "Semua persiapan up-to-date" dengan icon CheckCircle, `bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300`.

### Anggota Booking Roster (Beranda)

Replace existing `RosterItem` dengan upgrade:
- Card: `rounded-2xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm p-4`
- Avatar **w-12 h-12** (current w-11): initials + gender ring + payment status overlay (mengikuti pattern jamaah card di DESIGN-SYSTEM line 387-406)
- Layout: avatar | column (nama text-sm font-bold + paket text-xs text-gray-500) | progress
- Progress: visual bar `h-1.5 rounded-full bg-gray-100 dark:bg-slate-700` dengan inner emerald/amber based on pct, plus label persen
- Removed: text-only progress dot di current implementation

### Sticky WhatsApp CTA (semua route)

```
fixed bottom-0 left-0 right-0 z-40
bg-emerald-500 dark:bg-emerald-600
shadow-lg shadow-emerald-500/30
text-white
py-3.5
border-t-0
```

Inner: `max-w-lg mx-auto px-4 flex items-center justify-center gap-2`, MessageCircle icon size 18, text "Hubungi {agent.name}" text-sm font-bold.

Padding-bottom main content: `pb-24` (cukup untuk clear 48px button + safe-area-inset-bottom).

Jika `agent.phone` tidak tersedia atau `normalizeWaNumber` return null → sticky CTA disembunyikan (fallback: main padding-bottom kembali ke `pb-8`).

---

## Page Skeletons

### BerandaPage
```
[TopBar agent + dark toggle + logout]
[Hero countdown card]
[Smart alerts strip (conditional 0–2 cards)]
[Menu grid 3x2 (6 cards)]
[Section "Yang Perlu Anda Lakukan" — top 3 tasks]
[Section "Anggota Booking" — roster list]
[Section "Pengumuman" (conditional — kalau ada due payment H-60)]
... pb-24
[Sticky WA CTA]
```

### PerjalananPage (emerald)
```
[TopBar with back button]
[Hero paket card (sama gradient style hero Beranda, tapi konten = paket info: nama, year, durasi)]
[Section "Penerbangan" — Flight cards Pergi + Pulang]
[Section "Hotel" — Hotel cards Madinah + Makkah]
[Section "Itinerary Harian" — ItineraryList + link itinerary PDF]
[Sticky WA CTA]
```

### PembayaranPage (blue)
```
[TopBar with back button]
[Hero summary card — blue gradient, total booking text-4xl, progress bar besar, dibayar/sisa 2-col]
[Banner deadline H-30 — amber alert kalau applicable]
[Section "Per Jamaah" — JamaahPaymentCard list]
[CTA primary "Cara Transfer / Bayar" (modal/bottom-sheet rekening info)]
[CTA secondary "Konfirmasi Pembayaran ke Agent" (WA deeplink template)]
[Sticky WA CTA]
```

### DokumenPage (amber)
```
[TopBar with back]
[Jamaah selector pills (kalau >1 jamaah, otherwise hidden)]
[Section "Dokumen Wajib" — checklist cards untuk 6 dokumen:
   1. Paspor
   2. Visa Umroh
   3. Vaksin Meningitis
   4. KTP
   5. Kartu Keluarga (KK)
   6. Foto 4x6 latar putih
  Tiap item: ikon + nama + status badge (Lengkap ✓ emerald / Diproses ⏳ amber / Belum ✗ red)]
[Info card amber: "Belum punya dokumen tertentu? Hubungi {agent.name} untuk panduan & upload via chat"]
[Sticky WA CTA]
```

Dokumen status diturunkan dari `jamaah.dokumen` object (field `dokumen` di PortalJamaah, JSON dengan key `paspor`, `visa_umroh`, `vaksin_meningitis`, `ktp`, `kk`, `foto` — pakai existing logic `includesReadyDocument()` di BerandaTab line 28-31 sebagai referensi).

### PerlengkapanPage (violet)
```
[TopBar with back]
[Jamaah selector pills]
[Section "Perlengkapan Umroh" — grid checklist 2-col cards: Koper, Ihram, Mukena, Tas Paspor, dll, status diambil/belum]
[Sticky WA CTA]
```

### ManasikSpiritualPage (purple)
```
[TopBar with back]
[Card "Jadwal Manasik" purple gradient — tanggal/jam/lokasi (data dari schedule.manasik_*)]
[Section "Persiapan Spiritual" — checklist doa/hafalan/niat (dari spiritual data)]
[Sticky WA CTA]
```

### FaqPage (rose)
```
[TopBar with back]
[Intro card: "Pertanyaan umum jamaah umroh"]
[Accordion 8 FAQ — clickable judul, expand isi]
  1. Bagaimana cara melakukan pembayaran?
  2. Apa saja dokumen yang perlu disiapkan?
  3. Kapan deadline pelunasan?
  4. Apakah manasik wajib dihadiri?
  5. Bagaimana kalau saya sakit menjelang berangkat?
  6. Berapa berat koper maksimal yang diperbolehkan?
  7. Apakah pembayaran bisa dialihkan ke jamaah lain?
  8. Bagaimana prosedur pembatalan / refund?
[CTA besar bawah accordion: "Tidak menemukan jawaban? Hubungi {agent.name}" (WA deeplink)]
[Sticky WA CTA]
```

---

## Dark Mode

State management: simple boolean stored di `localStorage.portalDarkMode` (`'true'`/`'false'`). Initial value:
1. Read `localStorage.portalDarkMode` jika ada
2. Else fallback ke `window.matchMedia('(prefers-color-scheme: dark)').matches`

Toggle button di TopBar (Moon/Sun icon, pattern persis sama dengan agent dashboard line 783-787).

Apply: `document.documentElement.classList.toggle('dark', isDark)`. PortalDashboard `useEffect` yang sekarang force-remove dark class → diubah jadi apply logic di atas.

Semua className mengikuti DESIGN-SYSTEM dengan pasangan `dark:` variant.

---

## Component Inventory

### New components
- `src/components/portal-jamaah/components/HeroCountdown.tsx` — Beranda hero
- `src/components/portal-jamaah/components/HeroPaket.tsx` — Perjalanan hero (reuse pattern)
- `src/components/portal-jamaah/components/HeroPembayaran.tsx` — Pembayaran hero
- `src/components/portal-jamaah/components/PortalMenuGrid.tsx` — 3x2 menu cards grid (kontainer)
- `src/components/portal-jamaah/components/PortalMenuCard.tsx` — single menu card (renderable)
- `src/components/portal-jamaah/components/SmartAlertsStrip.tsx` — conditional alerts
- `src/components/portal-jamaah/components/TaskListWidget.tsx` — "Yang perlu Anda lakukan"
- `src/components/portal-jamaah/components/StickyWhatsAppCta.tsx` — sticky bottom CTA
- `src/components/portal-jamaah/components/PortalBackBar.tsx` — sub-page top bar (back + title + agent mini)
- `src/components/portal-jamaah/components/ThemeToggle.tsx` — dark mode toggle
- `src/components/portal-jamaah/pages/FaqPage.tsx` — new FAQ page
- `src/components/portal-jamaah/pages/DokumenPage.tsx`
- `src/components/portal-jamaah/pages/PerlengkapanPage.tsx`
- `src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx`

### Refactor / replace
- `pages/PortalDashboard.tsx` — state machine 7 routes, remove bottom nav, add sticky WA
- `tabs/BerandaTab.tsx` → `pages/BerandaPage.tsx` — new widgets added
- `tabs/PerjalananTab.tsx` → `pages/PerjalananPage.tsx` — restyled, new HeroPaket
- `tabs/BayarTab.tsx` → `pages/PembayaranPage.tsx` — restyled, new HeroPembayaran
- `tabs/PersiapanTab.tsx` — **deleted** (decomposed into 4 separate pages + Beranda widget)
- `components/PortalTopBar.tsx` — add dark toggle slot, larger hit areas, remove dummy bell
- `components/RosterItem.tsx` — visual progress bar + gender ring + payment overlay
- `components/StatusCard.tsx` — can be **deleted** (replaced by menu grid pattern)
- `components/PortalBottomNav.tsx` — **deleted** (replaced by menu grid)

### Untouched (passthrough redesign — colors only)
- `components/FlightCard.tsx` — apply dark mode + DESIGN-SYSTEM colors
- `components/HotelCard.tsx` — same
- `components/ItineraryList.tsx` — same
- `components/JamaahPaymentCard.tsx` — same
- `components/LogoutMenu.tsx` — same
- `tabs/persiapan/*` — keep as utility sub-components but extracted to be used by new page-level Dokumen/Perlengkapan/etc

---

## Data Dependencies (no backend changes)

All data sourced from existing hooks:
- `usePortalMe()` → `data.agent`, `data.booking`, `data.jamaah[]`, `data.schedule`
- `usePortalPersiapan()` → `persiapan.tahapan`, `persiapan.spiritual`, `persiapan.perlengkapan_per_jamaah`

FAQ content: hardcoded constant `PORTAL_FAQ` in `src/components/portal-jamaah/lib/faq.ts`.

---

## Animations & Interactions

Minimal animation untuk audience 40+:
- ✅ `active:scale-95` on tap (tactile feedback)
- ✅ `hover:translate-y-0.5` + `hover:shadow-xl` on menu cards
- ✅ Card scale on hover for icon (`group-hover:scale-110`) — single transform, subtle
- ❌ NO icon kinetic animation (`animate-icon-float`, dll dari agent dashboard) — distracting
- ❌ NO conic-gradient `diskusi-ai-border` — out of scope, no AI feature di portal jamaah scope ini

Page transitions: instant (`window.scrollTo(0,0,'auto')` on route change, persis seperti current).

---

## Out of Scope / Future

- Onboarding tour (intro tooltip pertama kali login)
- Push notifications (real, not dummy bell)
- Document upload UI (Dokumen page currently view-only checklist)
- FAQ search / CMS-managed FAQ
- Multi-language (current Bahasa-only)
- A/B test old vs new portal

---

## Acceptance Criteria

1. ✅ Semua 7 page route render tanpa error pada `PortalSession` valid
2. ✅ Bottom nav `PortalBottomNav` tidak ada lagi di DOM
3. ✅ Sticky WhatsApp CTA visible di semua route (selama `agent.phone` ada)
4. ✅ Dark mode toggle berfungsi, state persist di localStorage
5. ✅ Tidak ada teks dengan computed font-size < 12px di portal jamaah view
6. ✅ Semua interactive element punya touch target ≥ 44px
7. ✅ Menu grid 3x2 navigate ke 6 sub-page correctly
8. ✅ "Yang Perlu Dilakukan" widget show top-3 pending tasks dari persiapan data
9. ✅ FAQ page tampil 6+ pertanyaan accordion
10. ✅ TypeScript build pass, no new ESLint errors
11. ✅ Visual parity dengan Pencil mockup (yang akan dibuat terpisah, jadi reference)
