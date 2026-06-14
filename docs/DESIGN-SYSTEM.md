# Design System — Alhijaz Dashboard

Panduan komponen, warna, layout, dan pattern yang konsisten di seluruh project.

Terakhir diperbarui: 2026-06-14

---

## Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Base / body | `Inter`, system-ui | 14px (base) | 400 |
| Login page | `Outfit` (Google Fonts) | — | — |
| Heading page | — | `text-sm` (14px) | `font-bold` (700) |
| Section header | — | `text-xs` (12px) | `font-bold` + `uppercase tracking-wide` |
| Label | — | `text-xs` | `font-semibold` + `uppercase tracking-wide` |
| Body text | — | `text-sm` | 400 |
| Caption / meta | — | `text-[10px]`–`text-[11px]` | `font-medium` |
| Badge | — | `text-[9px]` | `font-bold` + `uppercase` |
| Stat headline | — | `text-2xl` | `font-bold` |

---

## Color Palette

### Backgrounds

| Context | Light | Dark |
|---------|-------|------|
| Page | `bg-gradient-to-b from-gray-50 to-gray-100` | `from-slate-900 to-slate-950` |
| Card | `bg-white` | `dark:bg-slate-800` |
| Card border | `border-gray-100` | `dark:border-slate-700` |
| Input | `bg-white` | `dark:bg-slate-900` |
| Input border | `border-gray-200` | `dark:border-slate-700` |
| Header (sticky) | `bg-white/90 backdrop-blur-md` | `dark:bg-slate-900/90` |

### Semantic Colors

| Role | Light | Dark | Usage |
|------|-------|------|-------|
| **Primary (Emerald)** | `emerald-500` / `emerald-600` | `emerald-400` | CTA buttons, focus rings, success |
| **Success** | `emerald-50` bg, `emerald-500` text | `emerald-900/20`, `emerald-300` | Session bars, status, komisi cair |
| **Error** | `red-50` bg, `red-600` text | `red-900/20`, `red-400` | Error messages, disconnect |
| **Warning/Accent** | `amber-50` bg, `amber-600` text | `amber-900/20`, `amber-400` | Jamaah, admin badge, komisi potensi |
| **Info** | `blue-50` bg, `blue-600` text | `blue-900/20`, `blue-400` | Kalkulasi, profile, komisi belum cair |
| **Violet** | `violet-50` bg, `violet-600` text | `violet-900/20`, `violet-400` | Compare, jamaah baru stats |
| **Purple** | `purple-50` bg, `purple-600` text | `purple-900/20`, `purple-400` | Manasik event (calendar) |
| **Birthday Pink** | `pink-50` bg, `pink-600` text | `pink-900/20`, `pink-400` | Birthday widget, birthday cards, female avatar highlight |
| **Telegram Blue** | `#2AA9E0`, `#229ED9`, `#16719E` | same | Telegram badge, connect banner |
| **Neutral** | `gray-50`–`gray-600` | `slate-400`–`slate-700` | Borders, secondary text |

### Feature Card Colors (Dashboard Menu)

| Feature | Icon Color | Background |
|---------|-----------|------------|
| Jadwal | `emerald-600` / `emerald-400` | `emerald-50` / `emerald-900/20` |
| Statistik | `emerald-600` / `emerald-400` | `emerald-50` / `emerald-900/20` |
| Kalkulasi | `blue-600` / `blue-400` | `blue-50` / `blue-900/20` |
| Compare | `violet-600` / `violet-400` | `violet-50` / `violet-900/20` |
| Meta CAPI | `gray-600` / `gray-400` | `gray-50` / `gray-800/30` |
| Agents | `cyan-600` / `cyan-400` | `cyan-50` / `cyan-900/20` |
| Jamaah | `amber-600` / `amber-400` | `amber-50` / `amber-900/20` |
| AI Tools | `purple-600` / `purple-400` | `purple-50` / `purple-900/20` |
| Brosur Jadwal | `rose-600` / `rose-400` | `rose-50` / `rose-900/20` |
| Settings | `gray-600` / `gray-400` | `gray-50` / `gray-800/30` |

### Jamaah Page Colors

3-status pembayaran: **Belum Bayar** (bayar=0), **Sudah DP** (bayar>0 & sisa>0), **Lunas** (sisa≤0).

| Context | Light | Dark |
|---------|-------|------|
| **Lunas** badge/amount | `emerald-600` text | `emerald-400` text |
| **Sudah DP** amount | `blue-600` text | `blue-400` text |
| **Belum Bayar** amount | `amber-600` text | `amber-400` text |
| Avatar overlay (Lunas) | `bg-emerald-500` checkmark ✓ | same |
| Avatar overlay (DP) | `bg-blue-500` clock icon | same |
| Avatar overlay (Belum) | `bg-amber-500` "?" text | same |
| Card tint (Belum Bayar) | `bg-amber-50/60 border-amber-200/60` | `bg-amber-900/10 border-amber-800/30` |
| Expanded payment block (Lunas) | `bg-emerald-50/60`, bar `bg-emerald-500` | `bg-emerald-900/20` |
| Expanded payment block (DP) | `bg-blue-50/60`, bar `bg-blue-500` | `bg-blue-900/20` |
| Expanded payment block (Belum) | `bg-amber-50/60`, bar `bg-amber-500` | `bg-amber-900/20` |
| Departure ≤10 days | `red-50` bg, `red-600` text | `red-900/20`, `red-400` |
| Departure ≤30 days | `amber-50` bg, `amber-600` text | `amber-900/20`, `amber-400` |
| Gender ring (P) | `ring-2 ring-pink-300` | same |
| Gender ring (L) | `ring-2 ring-blue-300` | same |

### Haji Page Colors

| Context | Light | Dark |
|---------|-------|------|
| Tahun masehi badge (right) | `text-orange-600 font-bold` | `text-orange-400` |
| BPIH button | `blue-50` bg, `blue-600` text, `border-blue-100` | `blue-900/20`, `blue-400`, `blue-800/40` |
| Pernyataan button | `violet-50` bg, `violet-600` text, `border-violet-100` | `violet-900/20`, `violet-400`, `violet-800/40` |
| WhatsApp button | `bg-emerald-500 text-white` (filled) | same |
| Avatar/Gender ring | Same as Jamaah Page | same |

Mata uang Haji ditampilkan dalam **USD** (bukan Rupiah): `paket_harga`/`bayar`/`sisa` diformat `formatUsd(n)` → `USD {n.toLocaleString('id-ID')}`. Filter & panel filter lanjutan Haji mengikuti pola **Advanced Filter Panel** (lihat Jamaah Page Components).

### Haji Plus Page Colors

| Context | Light | Dark |
|---------|-------|------|
| Hero Card background | `linear-gradient(135deg, #064e3b, #0F6E56, #065f46)` | same |
| Stat Card Icon (Total) | `bg-emerald-50 text-emerald-600` | `bg-emerald-900/20 text-emerald-400` |
| Stat Card Icon (Rata-rata)| `bg-blue-50 text-blue-600` | `bg-blue-900/20 text-blue-400` |
| Stat Card Icon (Tahun) | `bg-violet-50 text-violet-600` | `bg-violet-900/20 text-violet-400` |
| pax/tahun Badge | `bg-emerald-50 text-emerald-600 border-emerald-100` | `bg-emerald-900/20 text-emerald-400 border-emerald-800/40` |
| Chart Bars (10 colors) | Enum: EMERALD_PALETTE (`#065f46` to `#2dd4bf`) | same |

### Statistik Page Colors

| Context | Light | Dark |
|---------|-------|------|
| Komisi Cair bar | `bg-emerald-500` | same |
| Komisi Belum Cair bar | `bg-blue-400` | same |
| Komisi Potensi bar | `bg-gray-200` | `bg-slate-600` |
| Jamaah Baru stat | `text-violet-600` | `text-violet-400` |
| Departure ≤15 days badge | `bg-red-50 text-red-600` | `bg-red-900/20 text-red-400` |
| Departure >15 days badge | `bg-amber-50 text-amber-600` | `bg-amber-900/20 text-amber-400` |
| Comparison ↑ badge | `text-emerald-600` | `text-emerald-400` |
| Comparison ↓ badge | `text-red-500` | `text-red-400` |
| Chart grid stroke | `#f1f5f9` | `#1e293b` |

### Calendar Event Colors

| Event Type | Dot | Badge Text | Badge BG | Border Left |
|------------|-----|-----------|----------|-------------|
| Manasik | `bg-purple-500` | `text-purple-600` / `purple-400` | `bg-purple-50` / `purple-900/20` | `border-l-purple-400` |
| Keberangkatan | `bg-emerald-500` | `text-emerald-600` / `emerald-400` | `bg-emerald-50` / `emerald-900/20` | `border-l-emerald-400` |
| Kepulangan | `bg-blue-500` | `text-blue-600` / `blue-400` | `bg-blue-50` / `blue-900/20` | `border-l-blue-400` |

---

## Layout

### Page Structure

```
min-h-screen bg-gradient-to-b from-gray-50 to-gray-100
  └─ header (sticky top-0 z-30 backdrop-blur-md)
  └─ main (max-w-lg mx-auto)
       └─ px-4 pt-4/pt-5 pb-8
```

- **Max width**: `max-w-lg` (32rem / 512px) — mobile-first, centered
- **Page padding**: `px-4 pt-4 pb-8`
- **Card spacing**: `space-y-4` atau `mb-5` (regular), `space-y-3` (Statistik), `space-y-1.5` (compact view)

### Header (Sticky)

```
sticky top-0 z-30 backdrop-blur-md
bg-white/90 dark:bg-slate-900/90
border-b border-gray-100 dark:border-slate-700/50
```

- Inner: `max-w-lg mx-auto px-4 py-3 flex items-center`
- Back button: `w-9 h-9 rounded-xl bg-gray-100/80`

---

## Segmented Control (Settings Tab Bar)

iOS-style tab bar used in `SettingsPage.tsx`:

### Container

```
bg-gray-100 dark:bg-slate-800 rounded-xl p-1 flex gap-1 w-full
```

Wrapped inside sticky header: `sticky top-[53px] z-20 bg-white dark:bg-slate-800 border-b`

### Tab Item (Active)

```
flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
bg-white dark:bg-slate-700
shadow-sm (0 1px 3px rgba(0,0,0,0.08))
text-emerald-500 dark:text-emerald-400
font-semibold
transition-all duration-200
```

### Tab Item (Inactive)

```
flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
bg-transparent
text-gray-400 dark:text-slate-500
font-medium
active:opacity-70
transition-all duration-200
```

### Tab Config

| Tab | Label | Lucide Icon | Size | strokeWidth |
|-----|-------|-------------|------|-------------|
| 1 | Profil | `User` | 13 | 2.2 |
| 2 | Telegram | `Send` | 13 | 2.2 |
| 3 | CAPI | `Code` | 13 | 2.2 |

Label: `text-[11px]`

---

## Cards

### Standard Card

```
bg-white dark:bg-slate-800
rounded-2xl
border border-gray-100 dark:border-slate-700
shadow-sm
overflow-hidden
```

### Card with Header

```html
<div className="bg-white dark:bg-slate-800 rounded-2xl border ...">
  <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50">
    <h3 className="text-xs font-bold uppercase tracking-wide">Title</h3>
  </div>
  <div className="p-5">
    ...content...
  </div>
</div>
```

### Stat Card (Statistik Page)

```
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5
```

Inner structure:
- Icon badge: `w-8 h-8 rounded-lg {bg-color} flex items-center justify-center border {border-color} mb-2`
- Value: `text-2xl font-bold`
- Label: `text-[10px] text-gray-400 font-medium`
- Comparison: `text-[9px] font-semibold` (green/red/gray)

### Status Bar (Connected)

```
bg-emerald-50 dark:bg-emerald-900/20
border border-emerald-100 dark:border-emerald-800/40
rounded-2xl p-4
flex items-center justify-between
```

### Info Badge (Inline)

```
p-3 bg-blue-50 dark:bg-blue-900/15
border border-blue-100 dark:border-blue-800/30
rounded-xl
```

### Komisi Detail Row (Statistik)

```
bg-{color}-50 dark:bg-{color}-900/20 rounded-xl border border-{color}-100 dark:border-{color}-800/40 px-3 py-2.5 flex items-center justify-between
```

---

## Buttons

### Primary (CTA)

```
w-full flex items-center justify-center gap-2
py-3 rounded-xl
text-sm font-bold
bg-emerald-500 hover:bg-emerald-600
text-white
shadow-md shadow-emerald-500/20
transition-all duration-200
active:scale-95
disabled:opacity-70
```

### Icon Button (Header)

```
w-9 h-9
flex items-center justify-center
rounded-xl
bg-gray-100/80 dark:bg-slate-800/80
text-gray-500 dark:text-slate-300
hover:bg-gray-200 dark:hover:bg-slate-700
transition-colors
active:scale-95
```

### Login/Dashboard Button (Header — Subtle)

```
w-8 h-8
flex items-center justify-center
rounded-xl
bg-gray-100/80 dark:bg-slate-800/80
text-gray-500 dark:text-slate-300
hover:bg-gray-200 dark:hover:bg-slate-700
transition-colors
```

Logic: Shows `LogIn` icon → `/login` when logged out, `LayoutDashboard` icon → `/dashboard` when logged in. Uses `isSessionValid()` from `authUtils.ts` to check session.

### Text Button (Danger/Secondary)

```
flex items-center gap-1.5
px-3 py-1.5
rounded-lg
text-xs font-semibold
text-red-600 dark:text-red-400
hover:bg-red-50 dark:hover:bg-red-900/20
transition-colors
```

### Dashboard Menu Card Button

```
group relative overflow-hidden
{card.cardBg}  // gradient per fitur, dari MENU_CARDS
rounded-2xl p-3.5
border {card.cardBorder}
shadow-sm
{card.hoverShadow} hover:shadow-xl hover:-translate-y-0.5
transition-all duration-200
active:scale-[0.97]
```

Current dashboard home grid uses `grid grid-cols-3 gap-3`. Each card has:
- Decorative blurred color orb: `absolute -top-6 -right-6 w-20 h-20 rounded-full {card.iconBg} opacity-20 blur-2xl`.
- Soft white overlay: `absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent`.
- Icon shell: `w-11 h-11 rounded-xl {card.iconBg} {card.iconShadow}`, white icon, feature-specific icon animation.
- Label only on the card body (`text-[12px] font-bold`); desc exists in config but is not rendered on the current compact home grid.

### "Lihat Semua" Expand Button (Statistik)

```
w-full py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400
hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors
border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-center gap-1
```

### Jamaah Page Components

#### Command Bar (Search + Filters)

```
bg-white dark:bg-slate-800
rounded-2xl
border border-gray-100 dark:border-slate-700
shadow-sm overflow-hidden
```

Inner: search input `h-9` + hijriah year select `h-9 text-[10px]` + filter button `w-9 h-9`

#### Status Filter Pills (inside expandable panel)

```
flex-1 h-7 px-2.5 rounded-lg text-[10px] font-bold
// Active:
bg-emerald-500 text-white shadow-md shadow-emerald-500/20
// Inactive:
bg-gray-50 dark:bg-slate-900 text-gray-500 border border-gray-200
```

#### Advanced Filter Panel (Jamaah & Haji)

Panel filter lanjutan menggantikan baris chip lama. Group filter: status pembayaran (`belum_dp`/`belum_lunas`/`lunas`/`lebih_bayar`), window keberangkatan (30/60/90/`departed`), dokumen, perlengkapan, catatan, dan teks paket. Tiap group dilabeli:

```
text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500
```

Expand/collapse beranimasi via Framer Motion `AnimatePresence initial={false}`:

```
key: "umroh-filter-panel" / "haji-filter-panel"
initial: { height: 0, opacity: 0 }
animate: { height: 'auto', opacity: 1 }
exit:    { height: 0, opacity: 0 }
transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
overflow: hidden
```

#### Jamaah Card (Collapsed)

```
bg-white dark:bg-slate-800
rounded-2xl border border-gray-100 dark:border-slate-700
shadow-sm overflow-hidden
```

Layout: Avatar (w-10 h-10, gender ring, payment status overlay) → Info (nama + paket) → Status (lunas/sisa + departure badge) → Chevron

#### Avatar with Gender Ring + Payment Status Overlay

```html
<div className="relative">
  <div className="w-10 h-10 rounded-full ... ring-2 ring-pink-300"> <!-- or ring-blue-300 -->
    {initials}
  </div>
  <!-- Payment overlay — one of 3 statuses -->
  <!-- Lunas: emerald checkmark -->
  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800">
    <Check size={9} strokeWidth={3} />
  </div>
  <!-- DP: blue clock -->
  <div className="... bg-blue-500 ...">
    <Clock size={9} strokeWidth={3} />
  </div>
  <!-- Belum Bayar: amber "?" -->
  <div className="... bg-amber-500 ...">
    <span className="text-white text-[8px] font-bold">?</span>
  </div>
</div>
```

Card wrapper has conditional tint for "Belum Bayar": `bg-amber-50/60 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-800/30`

#### Expanded Detail (Jamaah)

```
px-3 pb-3 pt-2 border-t border-gray-50 dark:border-slate-700/50 space-y-3
```

Sections:
1. **Payment card** — progress bar + bayar/sisa amounts. Persen di-clamp 0–100 (`safeSisaForPct = Math.max(0, sisa)`; `pct = total>0 ? clamp(round(bayar/total*100),0,100) : 0`) supaya sisa negatif (lebih bayar) tidak merusak bar.
2. **Info grid 2×2** — WhatsApp, Tgl Lahir, Tgl Daftar, Berangkat
3. **Surat Pernyataan** — tombol `text-sm font-bold text-gray-800 dark:text-white` membuka `UmrohPernyataanViewer` (lihat di bawah)
4. **Perlengkapan/Dokumen** — flex-wrap badge pills (✓/✗)
5. **Action buttons** — WhatsApp + Tagih

#### Surat Pernyataan Viewer (`UmrohPernyataanViewer`)

Modal fullscreen yang merender HTML surat pernyataan dari cache via proxy ter-auth `GET /api/laporan/jamaah/doc-proxy` (server membungkus body ke shell A4 794×1123 print-ready). Kontrol:
- **Zoom**: pinch / tombol, min 1.0 max 3.0 step 0.25
- **Unduh PDF**: `format=pdf` dari proxy (`Content-Disposition: attachment`)
- **Bagikan PDF**: `navigator.share()` (file-only) di perangkat touch
- Rendering via `<iframe>` dengan responsive scaling agar muat lebar viewport

#### Sync Indicator

```
text-[10px] text-gray-400  // "Sync: Baru saja"
text-[10px] font-semibold text-emerald-600 animate-pulse  // syncing
```

---

## Tanya AI ("Diskusi")

### Diskusi Button (PackageCard, Action Row 1)

Compact 3-col grid button yang memicu Tanya AI modal. Geometry **persis sama** dengan sibling button (Brosur, Simpan), bedanya border 2px di-render sebagai animated conic-gradient ring (bukan static border-color).

```html
<button className="diskusi-ai-border flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 border-transparent transition-transform active:scale-95">
  <Sparkles size={20} className="text-emerald-500 dark:text-emerald-400 mb-1 animate-icon-twinkle" />
  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Diskusi</span>
</button>
```

### Tanya AI Full-Width Button (Single Package View)

Muncul hanya di `isSingleView` (deep-link ke 1 paket), label panjang, full-width:

```html
<button className="diskusi-ai-border w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-transparent mb-2 transition-transform active:scale-[0.98]">
  <Sparkles size={18} className="text-emerald-500 dark:text-emerald-400 animate-icon-twinkle" />
  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Tanya AI Tentang Paket Ini</span>
</button>
```

### `.diskusi-ai-border` — Animated Ring (index.css)

Rotating 2px conic emerald ring via `mask-composite` "cut-out center":

```css
.diskusi-ai-border {
  position: relative;
  isolation: isolate;
}
.diskusi-ai-border::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 2px;                 /* ring thickness — matches sibling border-2 */
  border-radius: inherit;
  background: conic-gradient(from var(--ai-angle),
    #10b981, #34d399, #6ee7b7, #059669, #10b981);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  animation: ai-rotate 2.8s linear infinite;
  pointer-events: none;
}
```

Fallback (no `@property` support): static linear gradient, no animation.

### Tanya AI Modal (`AskAIModal.tsx`)

Fullscreen bottom sheet dengan Framer Motion slide-up. Tracked via `visualViewport` untuk iOS Safari keyboard fix.

#### Container

```
fixed left-0 right-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col
top: viewportTop (vv.offsetTop)
height: viewportHeight (vv.height) || 100dvh
initial: y='100%' → animate: y=0, exit: y='100%'
transition: duration 0.32s, ease [0.32, 0.72, 0, 1]
```

Body-lock: `position:fixed` + `overflow:hidden` pada html & body + restore `scrollY` saat close.

#### Header

```
flex-shrink-0 border-b border-gray-100 dark:border-slate-800
Inner: px-4 py-3 flex items-center gap-3
  - Back: w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-800 (ChevronLeft 20)
  - AiAvatar size=40, showOnline
  - Title: text-sm font-bold "Asisten {FirstName}"
  - Subtitle: text-[10px] text-gray-500 flex gap-1 (Zap fill-emerald 10 + "AI · siap bantu jawab")
  - Info: w-9 h-9 rounded-xl (Info 16)
Package strip: px-4 pb-3 flex gap-1.5 text-[10px] (Package 12 + "Paket:" + package name truncate)
```

#### AiAvatar Component

Agent photo dengan Sparkles "AI" badge overlay di bottom-right. Ukuran 28 (inline bubble) atau 40 (header `showOnline`).

```
Wrapper: relative rounded-full w=h={size}
Photo (if available): w-full h-full rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-sm
Fallback: gradient `linear-gradient(135deg, #10b981, #059669, #047857)` dengan Sparkles icon (white)
Badge: absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white dark:border-slate-900
  width/height: max(14, round(size × 0.42))
  background: linear-gradient(135deg, #10b981, #059669)
  boxShadow (jika showOnline): 0 0 0 2px rgba(16,185,129,.25), 0 0 8px rgba(16,185,129,.35)
  Inner: Sparkles size=max(8, round(badgeSize × 0.55)) strokeWidth=2.5, white
```

#### Chat Area

```
flex-1 overflow-y-auto px-4 py-4 space-y-3
auto-scroll ke bottom tiap messages change (scrollTo { top: scrollHeight, behavior: smooth })
```

#### Greeting Bubble (first render)

```
Flex gap-2:
  - AiAvatar size=28
  - Bubble:
    inline-block bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5
    text-[13px] leading-relaxed text-gray-800 dark:text-slate-100 space-y-0.5
    "Assalamualaikum 👋"
    "Saya asisten AI-nya <strong>{firstName}</strong>. Ada yang mau ditanyain soal paket ini, Kak? 🙂"
  - Timestamp: text-[9px] text-gray-400 dark:text-slate-500 mt-1 ml-1 "Asisten AI · baru saja"
```

#### Preset Chips (shown only when messages.length === 0)

Label section: `text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500` "Pertanyaan populer"

```
flex flex-col gap-1.5 (stack 1-column, not 2-col grid)
Chip (default + expanded extras):
  text-left p-2.5 rounded-xl
  border border-emerald-100 dark:border-emerald-800/40
  bg-emerald-50/50 dark:bg-emerald-900/15
  active:scale-[0.96] transition-all
  Inner: flex items-start gap-1.5 → Icon (13, emerald-600, mt-0.5) + text-[11px] font-medium text-gray-700
```

Expand toggle: `w-full flex justify-center gap-1 py-2 text-[11px] font-semibold text-emerald-600` — "Lihat pertanyaan lain" / "Tutup" + rotating ChevronDown.

Chip pool: 24 questions yang di-shuffle tiap modal open. Pinned key: `'brosur'` (selalu di posisi default row).

#### User Bubble

```
flex justify-end
Inner: bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5
max-w-[85%] text-[13px] leading-relaxed
```

#### Typing Indicator

```
Flex gap-2:
  - AiAvatar size=28
  - Bubble: inline-flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3
    items-center self-start
    3× <span className="askai-dot w-1.5 h-1.5 rounded-full bg-gray-400"> (askai-dot-2, askai-dot-3 = stagger)
```

Animation `@keyframes askAiTyping` (scoped `<style>` inside modal):
```css
0%, 60%, 100% { opacity: .3; transform: translateY(0); }
30% { opacity: 1; transform: translateY(-3px); }
```
Interval 1.2s infinite ease-in-out, delays 0/0.15s/0.3s.

#### AI Bubble + Typewriter

```
Flex gap-2:
  - AiAvatar size=28
  - Right column (flex-1 space-y-2):
    - Bubble:
      inline-block bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-3
      text-[13px] leading-relaxed text-gray-800 dark:text-slate-100 break-words space-y-1
      TypewriterMessage (word-by-word reveal @ 22ms/word, strip unmatched **/*/__ during partial state)
      Cursor (saat partial): <span className="inline-block w-[2px] h-3.5 bg-emerald-500 ml-0.5 align-middle animate-pulse">
    - Timestamp: text-[9px] text-gray-400 mt-1 ml-1 "Asisten AI · baru saja"
```

Inline rich text rendering:
- `**bold**` → `<strong>`
- `*italic*` → `<em>`
- `__underline__` → `<span className="underline decoration-emerald-500 decoration-2 underline-offset-[3px] font-medium">`
- `- item` / `* item` / `• item` → bullet rows (emerald `•` + content)

#### Attachment Card (inline, below AI bubble)

**Brosur** (3:4 image card):
```
button block w-full max-w-[260px] rounded-2xl overflow-hidden
border border-emerald-200 dark:border-emerald-800/40 bg-white
shadow-sm active:scale-[0.98]
  Image area: aspect-[3/4] bg-gray-100
    <img object-cover loading="lazy">
    Maximize overlay: absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm
  Footer: px-3 py-2 border-t border-gray-100
    ImageIcon 12 emerald + text-[11px] font-semibold "Brosur Paket" + text-[10px] emerald "Lihat"
```

**Itinerary** (icon row, PDF-style):
```
button flex items-center gap-3 w-full max-w-[260px] px-3 py-3 rounded-2xl
border border-emerald-200 dark:border-emerald-800/40 bg-white shadow-sm active:scale-[0.98]
  Icon box: w-11 h-12 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200
    FileText 22 text-red-500
  Label: text-[12px] font-bold "Itinerary" + text-[10px] text-gray-500 "PDF · Tap untuk full screen"
  Maximize2 14 emerald
```

Fullscreen viewers (BrochureModal / ItineraryModal) mounted di luar sheet supaya overlay di atas modal.

#### WA Nudge Card (every Nth AI msg, 1st, & on fallback)

```
rounded-2xl border border-emerald-200 dark:border-emerald-800/40
bg-gradient-to-br from-emerald-50 to-white
dark:from-emerald-900/30 dark:to-slate-800/60
p-3
  Top row (flex items-center gap-2.5):
    - Agent photo: w-9 h-9 rounded-full object-cover border-2 border-white
      (fallback: w-9 h-9 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-500 + initials white text-[11px] font-bold)
    - Note: flex-1 text-[11px] font-semibold text-gray-800 dark:text-white leading-snug
      "💬 {renderInline(msg.note)}" — with **bold** name
  CTA (mt-2.5):
    w-full flex justify-center gap-1.5 py-2 rounded-xl
    bg-emerald-500 hover:bg-emerald-600 text-white
    text-[12px] font-bold shadow-md shadow-emerald-500/30
    active:scale-[0.96]
    → WaIcon 14 fill-white + "Chat {firstName} di WhatsApp"
```

#### Follow-up Pills (below last AI bubble, max 3 unasked chips)

```
flex flex-wrap gap-1.5 pt-0.5
Pill: inline-flex items-center gap-1 px-2.5 py-1 rounded-full
  border border-emerald-200 dark:border-emerald-800/40
  bg-emerald-50/70 dark:bg-emerald-900/20
  text-emerald-700 dark:text-emerald-300
  text-[11px] font-medium active:scale-[0.96]
  Icon 11 + label
```

#### Footer Input

```
flex-shrink-0 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5
  Flex items-center gap-2:
    - Input: flex-1 px-3.5 py-2.5 bg-gray-100 dark:bg-slate-800 border-0 rounded-full
      text-[13px] placeholder:text-gray-400
      focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60
      maxLength 500
    - Send (not typing): w-10 h-10 rounded-full
      background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)
      shadow-md shadow-emerald-500/30 active:scale-95 disabled:opacity-50
      Send 15 white
    - Stop (typing): w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 hover:bg-gray-300
      Square 13 text-gray-700 fill-gray-700
  Disclaimer row (mt-1.5 px-1):
    text-[9px] text-gray-500 dark:text-slate-400 flex-1 text-center
    "Jawaban bisa saja keliru. Konfirmasi akhir ke {firstName} ya 🙂"
  Char counter (if >= 250 chars):
    text-[9px] font-medium ml-2 (red-500 jika >= 480, else gray-400) — "{length}/500"
```

#### Session Limits & Rate Limits

- **Client-side**: `CLIENT_QUERY_LIMIT = 8` queries per modal session. Saat hit limit, show warning AI msg dengan WA nudge.
- **Client-side debounce**: `SEND_DEBOUNCE_MS = 500` prevent double-submit.
- **Fetch timeout**: `FETCH_TIMEOUT_MS = 15000` (15s).
- **Server-side**: 10 req / 60s / IP (`askAiRateLimitMap`).
- **Cache**: 7 hari di `ask_ai_cache` (Supabase), unique `(jadwal_id, question_hash)` scoped per `agent_id`.

#### WA Nudge Frequency

```ts
const WA_NUDGE_INTERVAL = 3;
const showWaNudge = isFallback || nextAiCount === 1 || nextAiCount % WA_NUDGE_INTERVAL === 0;
```

---

## Charts (Recharts)

Digunakan di `StatistikPage.tsx` dan `HajiPlusPage.tsx` untuk menampilkan tren data.

### AreaChart (Tren Jamaah Baru)

```tsx
<ResponsiveContainer width="100%" height={160}>
  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
    <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
    <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2.5} fill="url(#emeraldGrad)"
      dot={{ r: 3.5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
  </AreaChart>
</ResponsiveContainer>
```

### BarChart (Komisi Cair per Bulan)

```tsx
<ResponsiveContainer width="100%" height={160}>
  <BarChart data={komisiChartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => v >= 1000000 ? `${v/1000000}jt` : String(v)} />
    <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
  </BarChart>
</ResponsiveContainer>
```

### BarChart (Haji Plus Tren)

Multi-color bar chart menggunakan `<Cell>` dan palette emerald.

```tsx
<ResponsiveContainer width="100%" height="100%">
  <BarChart data={data.items} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
    <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
    <YAxis tickFormatter={yFmt} tick={{ fontSize: 9, fill: '#d1d5db' }} axisLine={false} tickLine={false} />
    <Tooltip content={<CustomTooltip />} />
    <Bar dataKey="pax" radius={[4, 4, 0, 0]} maxBarSize={32}>
      {data.items.map((_, index) => (
        <Cell key={index} fill={EMERALD_PALETTE[index % 10]} />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

### Custom Tooltip

```
bg-white dark:bg-slate-800 shadow-lg border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2 text-xs
```

---

## Modals

### StatListModal (Statistik Page)

```
fixed inset-x-4 top-8 bottom-8 z-50 max-w-lg mx-auto
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700
shadow-2xl flex flex-col overflow-hidden
```

- Backdrop: `fixed inset-0 z-50 bg-black/50 backdrop-blur-sm`
- Header: `px-4 py-3 border-b` with title + close button `w-8 h-8 rounded-lg`
- Content: `flex-1 overflow-y-auto`
- Animations: `fadeIn 150ms`, `slideUp 200ms`

### Bottom Sheet (Calendar Detail)

```
fixed inset-x-0 bottom-0 z-50
max-w-lg mx-auto
bg-white dark:bg-slate-800
rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700
shadow-2xl max-h-[70vh] flex flex-col
```

- Backdrop: `fixed inset-0 z-50 bg-black/40 backdrop-blur-sm`
- Handle bar: `w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600`
- Header: `px-4 pb-2` with date title + close button `w-8 h-8`
- Body: `flex-1 overflow-y-auto px-4 pb-4`
- Animation: Framer Motion `y: '100%' → 0`, duration 250ms, ease `[0.4, 0, 0.2, 1]`
- Body scroll lock: `document.body.style.overflow = 'hidden'`

### Bottom Sheet — AI Insight

Same base as Calendar Detail bottom sheet, plus:
- `max-h-[85vh] overflow-y-auto` (adaptive height, scrollable)
- Header: amber sparkle icon `w-7 h-7` + "AI Insight" title + date subtitle
- Body: 3 colored cards (emerald/blue/amber) with `px-3 py-2.5`
- Labels: `text-[10px] font-bold uppercase tracking-wide`
- Content: `text-[12px] leading-relaxed` with `**bold**` parsed to `<strong>`
- No refresh button (cron-only generation)

### Caption AI Modal (`CaptionAIModal.tsx`)

Centered dialog (bukan bottom sheet) untuk generate caption WA via `/api/ai-copy`. Entry point satu-satunya: PackageCard di halaman publik (per paket, via footer BrochureModal). Aksen fitur: **indigo**. (Endpoint juga punya mode `monthData` untuk caption multi-paket — dorman, tanpa UI, keputusan produk Jun 2026: Caption tidak dimunculkan di Brosur Jadwal.)

```
Container: relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden
Backdrop: absolute inset-0 bg-black/50 backdrop-blur-sm
Animation: Framer Motion scale 0.9→1 spring (damping 25, stiffness 300)
Header: px-4 py-3 border-b — Sparkles 16 indigo-500 + title text-sm font-bold + close w-8 h-8 rounded-lg
Body: flex-1 overflow-y-auto px-4 py-4
  - Idle: circle w-12 h-12 bg-indigo-100 (Sparkles 22) + text-sm + CTA indigo (py-3 px-6 rounded-xl text-sm font-bold bg-indigo-600 shadow-md shadow-indigo-500/20 active:scale-95)
  - Result: box bg-gray-50 dark:bg-slate-900/60 border rounded-xl p-4 text-sm whitespace-pre-line
Footer (hidden saat idle): px-4 py-3 border-t flex gap-2
  - Regenerate (icon-only): px-3.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600 (RefreshCw 17, animate-spin saat loading)
  - Salin: flex-1 py-3 rounded-xl text-sm font-bold bg-gray-100 text-gray-700 (Copy/ClipboardCheck 17)
  - Kirim WA: flex-1 Primary CTA emerald (WhatsAppIcon 17) → shareCaption() dari wa-copy/utils/waLink
```

Perilaku: generate manual (idle state, hemat rate limit 15x/2jam per device — key localStorage `ai_copy_timestamps`); caption reset saat `subject` berubah atau payload berubah saat reopen (snapshot JSON); fallback template lokal berlabel jelas saat API gagal.

### Caption Button (entry point)

Secondary button aksen indigo, geometry mengikuti sibling-nya:

```
BrochureModal footer:  flex-1 py-3 rounded-xl text-sm font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700/70 (Sparkles 17)
```

Visibilitas: hanya dirender saat `isSessionValid()` (tool agent, bukan untuk jamaah yang membuka halaman publik `/{slug}`).

### Calendar Widget (`UpcomingSchedule.tsx`)

Mini calendar grid on Dashboard home:
- Header: month/year + prev/next arrows
- Grid: 7-col (Min-Sab), colored dots under dates with events
- Legend: `text-[8px]` dots for Manasik, Keberangkatan, Kepulangan
- Click date with dots → opens bottom sheet with event details
- Group cards: colored left border, group badge, pesawat, paket, TL
- Data cached per month (no re-fetch when navigating back)

### AI Insight Alert Bar (`CalendarInsight.tsx`)

Compact 1-line alert below header, before calendar card:
```
flex items-center gap-2.5 px-3 py-2.5 rounded-xl
bg-emerald-50 dark:bg-emerald-900/20
border border-emerald-100 dark:border-emerald-800/40
cursor-pointer active:scale-[0.98] transition-all
```

Layout: pulsing dot → sparkle icon → text (truncated) → close (X) button
- Pulsing dot: `w-2 h-2 rounded-full bg-emerald-500` + `@keyframes pulse-glow`
- Sparkle icon: `w-5 h-5 rounded-md bg-emerald-100`
- Text: `text-[11px] font-medium truncate`
- Close: dismisses alert, stores in `sessionStorage('insightDismissed')`
- Click (except close) → opens AI Insight bottom sheet popup

### Document Viewer (Haji Page)

Full-screen iframe-based popup for viewing BPIH/Surat Pernyataan documents:
```
fixed inset-0 z-[9999]
bg-white dark:bg-slate-900
flex flex-col
```

- Animation: Framer Motion `y: '100%' → 0`, spring damping=28 stiffness=300
- Header: title + subtitle "Dokumen" + close button (rounded-full)
- Content: `<iframe>` flex-1 loading internal system URL directly
- Footer: "Bagikan Dokumen" CTA button (emerald) — uses `navigator.share()` (native share) with URL fallback to `window.open()`
- Why iframe: internal system URLs (115.124.86.220) have CORS restrictions — react-pdf fetch fails, but iframe can load directly

### AI Tools Hub (`AIToolsPage.tsx`)

Hub page for AI tools & utilities — vertical stack of tool cards. Card urutan: **Brosur Jadwal**, **Kalkulasi**, **Bandingkan Paket**, **Kurs Hari Ini**, **Simulasi Haji Plus**, **Landing Page**, **Voice Over**, **AI Assistant (MCP)**, **Kartu Nama**.

```
relative w-full text-left bg-white dark:bg-slate-800 rounded-2xl
border border-gray-100 dark:border-slate-700 shadow-sm p-4
hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] transition-all cursor-pointer
```

- Icon box: `w-10 h-10 rounded-xl {color-50 dark:color-900/20} flex items-center justify-center`
- Icon: `text-{color}-600 dark:text-{color}-400` (Lucide — see per-tool)
- Title: `text-sm font-bold mt-3`
- Desc: `text-xs text-gray-400 dark:text-slate-500 mt-0.5`
- Disabled card: `opacity-60 cursor-default` (no hover effects) + badge `"Segera Hadir"` top-right. Current hub keeps **Kartu Nama Digital** disabled, even though `/dashboard/ai-tools/business-card` can render if opened directly.

#### Per-Tool Icon & Color

| Tool | Icon | Color accent |
|------|------|--------------|
| Brosur Jadwal | `FileImage` | rose |
| Kalkulasi | `Calculator` | blue |
| Landing Page | `Globe` | purple |
| Bandingkan Paket (Compare) | `ArrowLeftRight` | violet |
| Kurs Hari Ini | `Banknote` | amber |
| Simulasi Haji Plus | `BarChart3` | emerald |
| Voice Over Generator | `Mic` | purple |
| AI Assistant (MCP) | `Bot` | teal |
| Kartu Nama Digital *(hub disabled)* | `CreditCard` | teal |

#### "Segera Hadir" Badge

```
absolute top-3 right-3 text-[8px] font-bold uppercase tracking-wide
bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500
px-2 py-0.5 rounded-full
```

#### Sub-Page Header Override (DashboardLayout)

Ketika navigasi ke AI Tools sub-page, header icon + label di-override sesuai sub-page (dari `AI_SUB_STYLES` map di `DashboardLayout.tsx`):
- `brosur-jadwal`: FileImage icon, rose bg/border
- `landing-page`: Globe icon, purple bg/border
- `voice-over`: Mic, purple
- `business-card`: CreditCard, teal
- `haji-plus` / `haji-plus/export` / `haji-plus/simulasi`: BarChart3, emerald
- `kurs`: TrendingUp, emerald
- `compare`: ArrowLeftRight, violet
- `mcp`: Bot, teal — label "AI Assistant (MCP)"

### Brosur Jadwal (`BrochureSchedulePage.tsx`)

Tool export brosur paket umroh bulanan di `/dashboard/ai-tools/brosur-jadwal`. Preview selalu mengikuti rasio export asli **1080 x 1620 (2:3)** dan hasil akhir berupa PNG. Template menerima prop `variant: 'default' | 'winter'` (lihat **Winter Variant** di bawah).

#### Page Shell

```
Root: pb-8
Sticky month tabs: sticky top-0 z-10 bg-white dark:bg-slate-900 border-b
Tab scroller: overflow-x-auto no-scrollbar
Preview wrapper: px-4 pt-5 flex justify-center
Preview max width: 480px
```

Month pill:
```
px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors
active: bg-emerald-500 text-white
inactive: bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300
```

#### Preview Card

```
width: 100%
aspect-ratio: 1080 / 1620
border-radius: 18px
overflow: hidden
background: #fff
box-shadow: 0 12px 40px rgba(0,0,0,0.18)
```

The real template is rendered at `BROCHURE_W=1080`, `BROCHURE_H=1620` (2:3), then previewed with `transform: scale(previewScale)`. Keep this scaling model so preview and exported PNG stay 1:1.

#### Export Template (`BrochureScheduleTemplate.tsx`)

Brand colors are tokenized into a theme object selected by `getTheme(variant)`. **Classic theme** (`variant='default'`):

| Token | Value | Usage |
|-------|-------|-------|
| `BRAND_RED` | `#C8102E` | headline, active brand accents |
| `DEEP_RED` | `#870018` | table header gradient, price text |
| `DARK_RED` | `#5A0010` | shadows / contrast |
| `GOLD` | `#C98A2C` | stars, dashed footnote |
| `PALE_GOLD` | `#F8DFA1` | headline stroke, divider |
| `CREAM` | `#FFF8EC` | alternate table rows |
| `ROW_LINE` | `#F0D8B5` | table borders |
| `INK` | `#241A1C` | body / package text |
| `MUTED` | `#6F6264` | secondary text |

Template structure:
- Header: Alhijaz logo left, "5 Pasti Umrah" badge right.
- Title: "PAKET UMROH" + month label with red/gold layered type.
- URL pill: `alhijaz.co/{slug}` fallback from agent website.
- Table columns: `TGL`, `PAKET`, `HARI`, `HOTEL`, `HARGA`.
- Backdrop assets: `/img-brosur/nabawi-dome.png`, `/img-brosur/kabah.png`, `/img-brosur/nabawi-wide.png`.
- Row capacity: frontend splits each month into pages of 10 packages (`PACKAGES_PER_IMAGE=10`).
- Hotel column shows Mekkah/Madinah side-by-side when both are present, with star marks.
- Harga uses cheapest valid room price in priority `Quard → Triple → Double`; `Infant` is ignored.
- Sold-out packages (`seat_sisa <= 0`) render a rotated red `SOLD OUT` stamp instead of price.
- Footer includes agent photo/name, formatted local WhatsApp number, and WhatsApp CTA styling.

#### Winter Variant ("Musim Dingin")

`BrochureScheduleTemplate` accepts `variant: 'default' | 'winter'` (default `'default'`). `BrochureSchedulePage` sets `variant='winter'` when the brosur filter is **Tipe Paket → "UMROH MUSIM DINGIN"** (`filterDim==='tipe' && filterValue==='UMROH MUSIM DINGIN'`); the exported label becomes **"MUSIM DINGIN"**. Winter swaps the entire red/gold chrome for an icy-blue palette and adds winter-only decorations.

**Winter theme tokens** (icy blue):

| Token | Value | Usage |
|-------|-------|-------|
| `W_NAVY_DARK` | `#172554` | deep gradient stop, top-bar/footer base |
| `W_NAVY` | `#1E3A8A` | headline, date-badge / table-header stop |
| `W_BLUE` | `#1D4ED8` | day count + price text |
| `W_BLUE_BRIGHT` | `#2563EB` | top-bar mid, table-header end, dividers |
| `W_SKY` | `#7DD3FC` | top-bar light stop |
| `W_FROST` | `#BFDBFE` | URL-pill border, avatar ring, footer labels |
| `W_FROST_2` | `#CFE0FB` | frost accents |

Classic → Winter mapping for the major surfaces:

| Surface | Classic | Winter |
|---------|---------|--------|
| Top-bar gradient | `#5A0010 → #C8102E → #F0445F → #C8102E` | `#172554 → #2563EB → #7DD3FC` |
| "PAKET UMROH" text | `#C8102E` (gold shadow) | `#1E3A8A` (white shadow) |
| Month title gradient | `#FF5A70 → #C8102E → #A4001D → #5A0010` | `#60A5FA → #1D4ED8 → #1E3A8A → #172554` |
| Title outline / stroke | `#F8DFA1` / `#870018` | `#FFFFFF` / `#1E3A8A` |
| Table header gradient | `#870018 → #C8102E` | `#172554 → #2563EB` |
| Row dividers | `#F0D8B5` | `#E5EDFB` |
| Date badge (non-sold) | `#870018 → #C8102E`, border `#F8DFA1` | `#1E3A8A → #2563EB`, border `#FFFFFF` |
| Day count + price | `#870018` | `#1D4ED8` |
| Footnote | bg `#FFF8EC`, text `#870018` | bg `#EAF2FF`, text `#1E3A8A` |
| Footer gradient | `#5A0010 → #870018 → #C8102E` | `#172554 → #1E3A8A → #2563EB` |

**Winter decorations** (rendered only when `variant==='winter'`):
- **Snowflakes** — 6 SVG flakes drawn from `SNOWFLAKE_PATH = 'M12 2v20M2 12h20M5 5l14 14M19 5L5 19'` (six-point star), `viewBox="0 0 24 24"`, `strokeLinecap="round"`, `filter: drop-shadow(0 1px 2px rgba(80,130,200,0.25))`, `pointer-events:none`, `zIndex:1`. Sizes 28–60px, colors `#BCD9FF`/`#9EC3F5`, opacity 0.7–0.85. Top 3 sit above the table; bottom 3 hug the side margins (`left:8`/`right:8`) so they stay visible at any row count.
- **Snow drift** — full-width element at `bottom:0`, `height:220px`, `background: radial-gradient(130% 100% at 50% 135%, #EEF5FF 42%, rgba(238,245,255,0) 72%)`, `pointer-events:none`.
- **No ribbon** — a winter tagline ribbon was prototyped then dropped; it does not render.

#### Action Bar

```
Footer: padding 10px, border-top rgba(15,23,42,.08)
Desktop: single Download button
Touch/native-share capable devices: grid-cols-2 Share + Download
```

Share button:
```
flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold
bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20
active:scale-[0.98] disabled:opacity-70
```

Download button:
```
flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold
text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-slate-800
border border-emerald-200 dark:border-emerald-700/70
active:scale-[0.98] disabled:opacity-70
```

Export uses `modern-screenshot` (`domToCanvas`) with:
- `scale: EXPORT_SCALE`, fixed `width=1080`, `height=1620`, `backgroundColor: #FFFFFF`.
- Embedded brochure font CSS (`preferredFormat: 'woff2'`) for Inter/Bebas Neue consistency.
- `timeout: 15000`, `fetch.requestInit.cache='force-cache'`, and SVG/control-character cleanup features.
- Two capture attempts with `waitForFonts()`, `waitForImages(target)`, double `requestAnimationFrame`, and blank-canvas detection before blob export.
- Per-page blob cache so the second Share tap on iOS can call `navigator.share()` inside the user-activation window.

### Voice Over Generator (`VoiceOverPage.tsx`)

3-step flow: Script → Voice → Result.

#### Mode Toggle (Dari Paket / Tulis Manual)

```
flex gap-2
button: flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold
active: bg-purple-500 text-white shadow-md shadow-purple-500/20
inactive: bg-gray-50 dark:bg-slate-900 text-gray-500 border border-gray-200 dark:border-slate-700
```

#### Duration Pills

```
px-3 py-1.5 rounded-lg text-xs font-bold
active: bg-purple-500 text-white
inactive: bg-gray-50 dark:bg-slate-900 text-gray-500 border border-gray-200
```

#### Voice Selection (2-Column Grid)

```
grid grid-cols-2 gap-2
button: px-3 py-2.5 rounded-xl border cursor-pointer flex items-center gap-2 text-left
selected: border-purple-500 bg-purple-50 dark:bg-purple-900/20
unselected: border-gray-200 dark:border-slate-700
```

Radio dot: `w-3.5 h-3.5 rounded-full border-2`, inner `w-1.5 h-1.5 rounded-full bg-purple-500`
Name: `text-xs font-semibold`
Desc: `text-[10px] text-gray-400 truncate`

#### CTA Button (Generate)

```
w-full py-3 rounded-xl text-sm font-bold
bg-purple-500 hover:bg-purple-600 text-white
shadow-md shadow-purple-500/20
active:scale-95 disabled:opacity-50
```

#### Audio Player (Result)

```
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-5
animation: voResultIn 0.3s ease-out (translateY 8px→0, opacity 0→1)
```

- Play/Pause button: `w-12 h-12 rounded-full bg-purple-500 text-white shadow-lg shadow-purple-500/30`
- Progress bar: `h-1.5 rounded-full bg-gray-200 dark:bg-slate-700` → fill `bg-purple-500`
- Seek dot (hover): `w-3 h-3 rounded-full bg-purple-500 shadow-md opacity-0 group-hover:opacity-100`
- Time display: `text-xs text-gray-400 font-mono`
- Download MP3: solid purple CTA `bg-purple-500 text-white rounded-xl`
- Download WAV: outline purple `text-purple-600 bg-purple-50 border border-purple-200 rounded-xl`

### Kartu Nama Digital (`BusinessCardPage.tsx`)

Direct route: `/dashboard/ai-tools/business-card`. Hub card is still disabled with `"Segera Hadir"`, but the page component renders when routed directly.

#### Canvas Formats

| Format | Size | Preview thumb |
|--------|------|---------------|
| Landscape | `1050 × 600` | `88 × 54` |
| Portrait | `600 × 1020` | `54 × 88` |

Design choices:
- `d1` Emerald Split
- `d2` Dark Navy
- `d3` Minimal Line
- `d4` Warm Gold
- `d5` Full Dark

#### Page Structure

```
Root: px-4 pt-4 pb-8 space-y-3.5
Cards: bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden
Section header: px-4 py-3 border-b text-[10px] uppercase tracking-wide
```

Format segmented control:
```
flex bg-gray-100 dark:bg-slate-900 rounded-lg p-0.5
active: bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm
inactive: text-gray-400 dark:text-slate-500
```

#### Preview Scaling

The real card is rendered at fixed export size, then previewed with transform scaling:

```
previewScale = min((containerWidth - 48) / CARD_SIZE[format].w, 0.6)
Preview frame: overflow-hidden borderRadius 8 boxShadow 0 4px 24px rgba(0,0,0,0.12)
Inner: width/height = CARD_SIZE, transform: scale(previewScale), transform-origin: top left
```

Thumbnails use the same renderer at fixed size with `thumbScale` (`88/1050` or `54/600`) so design previews match the export output.

#### Data & QR

- Uses agent name/photo/phone/email/website/slug from session.
- QR generated by `qrcode` and points to the agent public link.
- Missing photo falls back to initials via the shared `Avatar` helper.
- Contact icons are inline SVG (`PhoneSvg`, `MailSvg`, `GlobeSvg`) for export compatibility.

#### Export / Share

```
Hidden export node: fixed left -9999 top -9999, exact card width/height
Capture: @zumer/snapdom(cardExportRef.current, { scale: 2 })
Download: result.download({ type: 'png', filename: kartu-nama-{slug}-{format} })
Share: result.toBlob({ type: 'png' }) → File → navigator.share({ files: [file] })
```

Keep share payload file-only. Do not add title/text/url.

### AI Assistant MCP (`McpIntegrationPage.tsx`)

Self-service integrasi MCP di `/dashboard/ai-tools/mcp` — agent mengelola kunci akses untuk menghubungkan asisten AI pribadinya (hermes/OpenClaw/Claude) ke data jamaah & paket (read-only). Accent color: **teal**.

**Prinsip UX (2026-06-06): target pengguna non-teknis 40-an** — minim kalimat, langkah bernomor, label bahasa sehari-hari ("Kunci Akses" bukan "API key", "Buat Kunci Baru" bukan "Rotate", "Putuskan" bukan "Revoke"), detail teknis (raw key + JSON config) disembunyikan di balik toggle "Lihat detail", dan daftar tool teknis diganti **contoh pertanyaan**.

#### Page Shell

```
Root: px-4 pt-4 pb-8 space-y-4
Cards: bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4
Section label: text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 px-1
Skeleton (loading): h-3/h-4 bg-gray-200 dark:bg-slate-700 rounded-md animate-pulse (2 placeholder cards)
```

#### Intro Card

Icon box `w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20` + `Bot` 20 teal, judul "Asisten AI Pribadi" `text-sm font-bold`, deskripsi 1 kalimat `text-xs text-gray-400`. Di bawahnya 3 **chip jaminan** (pill emerald):

```
inline-flex items-center gap-1 px-2 py-1 rounded-full
bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40
text-[10px] font-semibold text-emerald-700 dark:text-emerald-300
```

Isi: `ShieldCheck` "Hanya membaca" · `Lock` "Hanya data milikmu" · `Trash2` "Bisa diputus kapan saja".

#### Kartu Kunci Akses — 3 State

1. **Belum tersambung** → 1 baris "Belum tersambung." + CTA teal standar (`py-3 text-sm font-bold bg-teal-500 hover:bg-teal-600 shadow-md shadow-teal-500/20 active:scale-95 disabled:opacity-50`, icon `KeyRound` 16) label "Buat Kunci Akses".
2. **Kunci aktif** → status box JUJUR berdasarkan `lastUsedAt` (stamp pemakaian dari server, kolom `agents.mcp_key_last_used_at`, di-update throttled 10 menit saat auth `/mcp` sukses):
   - `lastUsedAt` terisi → **"Tersambung"** emerald (pola Status Bar): `bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 rounded-xl p-3` + `ShieldCheck` 18, sub "asisten terakhir aktif {waktu relatif}" (`waktuRelatif`: baru saja / X menit/jam/hari lalu).
   - `lastUsedAt` null → **"Kunci aktif — asisten belum tersambung"** biru (pola Info Badge): `bg-blue-50 dark:bg-blue-900/15 border-blue-100 dark:border-blue-800/30` + `Clock` 18, sub "dibuat {tanggal} · kalau kunci hilang, buat kunci baru". JANGAN klaim "Tersambung" hanya karena kunci ada.
   Pasangan tombol `py-3 text-xs font-bold`:
   - **Buat Kunci Baru**: mini-CTA teal (icon `RefreshCw` 14)
   - **Putuskan**: danger merah (`bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100`, icon `Trash2` 14)
   - Kedua aksi memunculkan **inline confirm amber** 1 kalimat (`TriangleAlert` 14, teks `text-xs amber-600/400`, tombol "Ya, lanjut" `bg-amber-500 hover:bg-amber-600 font-bold shadow-md shadow-amber-500/20` + "Batal" netral).
3. **Kunci baru (show-once)** → alur 2 langkah bernomor (badge `w-6 h-6 rounded-full bg-teal-500 text-white text-xs font-bold`):
   - **1. Salin pengaturan ini** → CTA utama full-width "Salin Pengaturan" (`Copy`→`Check` + label "Tersalin ✓"). Klik tombol ini juga MEMUNCULKAN box umpan balik **"Isi yang tersalin"** (emerald box berisi `<pre>` config gelap `bg-gray-900 dark:bg-slate-950 text-emerald-300 rounded-lg p-2.5 text-[10px] font-mono`) — pengguna melihat persis apa yang masuk clipboard.
   - **2. Tempel di aplikasi asisten AI-mu. Selesai!**
   - Warning amber 1 baris: "Hanya muncul sekali — salin sekarang."
   - **Rincian card** (selalu tampil, gaya struk): `border rounded-xl divide-y`, 2 row `px-3 py-2.5` — label `text-[10px] font-semibold text-gray-400` ("Alamat server" / "Kunci akses") + nilai `text-[11px] font-mono` (URL truncate; key break-all) + copy icon-button netral `w-8 h-8` per row. Key TIDAK pernah bisa dilihat lagi setelah state ini ditutup (GET hanya kembalikan status).

#### Contoh Pertanyaan Card (pengganti daftar tool)

Card `divide-y divide-gray-50 dark:divide-slate-700/60`; tiap row `px-4 py-3 flex items-center gap-3`: emoji `text-base` + pertanyaan dalam tanda kutip `text-xs text-gray-600 dark:text-slate-300`. 6 contoh: belum lunas 💰, paket+seat 📅, kalkulasi 🧮, brosur/itinerary 🖼️, Tour Leader 🧕, ulang tahun 🎂.

#### Notes Card

1 baris saja: `bg-gray-50 dark:bg-slate-800/60 rounded-2xl border px-4 py-3 flex items-center gap-2.5` + `Lock` 14 — "Jangan bagikan kunci ke siapa pun."

#### Toast & Analytics

Toast mengikuti pola ShareKurs: `fixed bottom-28 left-1/2 -translate-x-1/2 z-[10000] bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl`, auto-dismiss 2500ms.

```ts
trackEvent('feature', 'open_mcp_integration'); // page open
trackEvent('action', 'mcp_generate_key');
trackEvent('action', 'mcp_revoke_key');
```

API: `GET/POST/DELETE /api/mcp-key` (lihat docs/project-summary.md §7 — MCP Endpoint).

### Landing Page Config (`LandingPagePage.tsx`)

Mobile-first editor untuk `/dashboard/ai-tools/landing-page` dengan lebar `max-w-lg`. Halaman ini punya 3 tab: SEO landing Umroh, SEO landing Haji, dan editor Link Bio. Semua state awal memakai skeleton, bukan spinner, agar perpindahan tab terasa halus.

#### Segmented Tab (`SegmentedTab` component)

```
Wrapper: max-w-lg mx-auto pt-4
Tabs inset: px-4 mb-4
Container: bg-gray-100 dark:bg-slate-800 rounded-xl p-1 flex gap-1
Tab:
  flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
  active: bg-white dark:bg-slate-700 shadow-sm font-semibold {accent color}
  inactive: bg-transparent text-gray-400 dark:text-slate-500 font-medium active:opacity-70
  disabled-like: bg-transparent text-gray-300 dark:text-slate-600 opacity-70
  Icon size=14 strokeWidth={active ? 2.4 : 2}
  Label: text-[13px]
  Custom-indicator dot: w-1.5 h-1.5 rounded-full (accent saat active, gray-300 saat inactive)
```

Tab Bio memakai accent teal dan tersedia untuk agent maupun admin. `LandingPagePage.tsx` menyimpan tab aktif di URL `/dashboard/ai-tools/landing-page/{umroh|haji|bio}` supaya reload/back tetap kembali ke tab yang sama.

#### Accent Tokens

| Tab | Accent | Focus border | Focus ring | Preview gradient |
|-----|--------|--------------|------------|------------------|
| Umroh | `emerald` | `focus:border-emerald-500` | `focus:ring-emerald-500/20` | `bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-800` |
| Haji | `amber` | `focus:border-amber-500` | `focus:ring-amber-500/20` | `bg-gradient-to-br from-amber-600 via-orange-600 to-rose-700` |
| Bio | `teal` | `focus:border-teal-500` | `focus:ring-teal-500/20` | Public page theme token from `bio/themes.css` |

#### Shared Link Card (`UrlCard`)

Dipakai oleh tab Umroh, Haji, dan Bio sebagai kartu paling atas tepat di bawah segmented tab.

```
rounded-2xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm p-3
Row: flex items-center gap-2
Icon tile: w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600
Label: text-[10px] uppercase tracking-wider font-semibold text-gray-500
URL: text-sm font-bold text-gray-800 dark:text-white truncate
Copy button: px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600
```

#### Umroh/Haji SEO Card

```
Content stack: px-4 pb-28 flex flex-col gap-3
Card: rounded-2xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm p-4
```

OG image uploader:
```
Header row: label uppercase xs font-semibold + accent dot + "1200 × 630 px"
Dropzone: relative w-full aspect-[1200/630] rounded-xl overflow-hidden border-2 border-dashed
Image: w-full h-full object-cover
Default fallback: DefaultOgPreview with accent gradient + agent photo + badge
Hover overlay: bg-black/35 + Upload/Ganti Gambar label
Reset OG: absolute top-2 right-2 px-2 py-1 rounded-lg text-[10px] font-bold bg-white/95 shadow-sm
```

Title/Description fields:
```
Input/Textarea:
  w-full px-3 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border
  border-gray-200 dark:border-slate-700 {accent focus:border} focus:ring-2 {accent ring}
Textarea: rows=3 resize-none min-h-[72px]
Counter: text-[10px] font-mono gray → amber at 90% → red when over limit
```

Char limits:
- Title: 60 chars
- Description: 160 chars

WhatsApp preview:
```
mt-4 pt-4 border-t border-gray-100 dark:border-slate-700/50
Card: rounded-xl bg-gray-50 dark:bg-slate-900/40 border border-gray-100 p-2 flex gap-2.5
Image: w-[72px] h-[72px] rounded-lg
Title: text-[13px] font-semibold line-clamp-2
Description: text-[11px] text-gray-500 line-clamp-2
```

Sticky save bar untuk Umroh/Haji hanya muncul saat `textDirty`:
```
fixed inset-x-0 bottom-0 z-40 bg-white/95 dark:bg-slate-900/95 border-t
Button: w-full py-3 rounded-xl bg-emerald-500 text-white font-bold + Save icon
```

#### Bio Editor Tab (`bio-editor/*`)

Bio editor memakai autosave debounce dan explicit `Simpan` pada sheet. Tile baru default menyimpan intent `visible: true`; jika field wajib belum lengkap, backend tetap menerima autosave dengan config tersanitasi dan public tile component akan `return null` sampai props wajib tersedia.

Editor tidak menampilkan kartu/toggle status publik. Di UI saat ini Bio dinormalisasi aktif (`ensureBioEditorConfig` mengubah `enabled` menjadi `true` saat load/save); server masih mengembalikan 404 untuk config lama/manual yang tersimpan dengan `enabled:false` ketika dibaca tanpa token owner/admin.

Main stack:
```
Root: pb-28
Content: px-4 pb-4 flex flex-col gap-3
Card radius: rounded-2xl
Card border: border-gray-100 dark:border-slate-700
Card shadow: shadow-sm
```

Hint banner:
```
One-time banner stored in localStorage key bio-editor-hint-dismissed-v1
rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3
Dismiss button: w-6 h-6 rounded-md
Transition: opacity + max-height + scale, 200ms
```

Theme picker:
```
Card: p-3
Header: "TEMA" + "{6} tema · geser"
Scroller: flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-thin
Theme tile: w-16 h-20 rounded-lg + sample accent dot/lines
Active: border-emerald-500 shadow-md shadow-emerald-500/20 + check badge
Right-edge fade: absolute right-0 w-10 gradient to signal horizontal scroll
```

Public Bio themes:
- `emerald`
- `desert`
- `midnight`
- `rosegold`
- `sunset`
- `mono`

Hero and SEO entry cards:
```
HeroCard: agent photo/name/tagline/badges/social summary, opens SheetHero
SeoCard: "Atur SEO" row with Search icon, optional "KUSTOM" badge, opens SheetSeo
Seo subtitle default: "Title, deskripsi & gambar pratinjau saat link dibagikan"
Seo custom subtitle: "{n}/3 field dikustomisasi · tap untuk edit"
```

`SheetHero` punya tombol AI tagline (sparkle icon) yang memanggil `POST /api/bio/:slug/tagline-generate`. Endpoint mengembalikan 1 baris tagline natural dari OpenAI — di-stream ke field tagline dengan typewriter feel sebelum diserahkan ke validator. Rate limit per agent supaya tidak spam OpenAI.

Tile section:
```
Section label: BAGIAN
Right hint: "{n} bagian · tahan ⋮⋮ untuk mengurutkan"
List gap: flex flex-col gap-2
Row: bg-white rounded-2xl border shadow-sm
Drag handle: GripVertical, px-2 py-4, touch-none
Icon tile: w-9 h-9 rounded-lg bg-gray-100
Visibility action: Eye / EyeOff button
Edit action: ChevronRight
```

Tile badges:
```
Type badge:
  SISTEM      → umroh (Jadwal), umroh_landing (Umroh), haji, wa
  FEATURED   → featured
  LINK        → custom link
  TEKS        → text
  FOTO        → photo
  TESTI       → testimonial
Status badge:
  SIAP              → complete + visible
  TERSEMBUNYI       → complete + hidden
  PERLU DILENGKAPI  → missing required field
  ORPHAN            → featured package no longer available
```

Subtitle row pada `wa` tile mem-format nomor agent ke pola lokal (62… → 0…) dan menampilkan `→ 0852-xxxx-xxxx`. Jika nomor tidak ada, fallback ke "Belum ada nomor HP".

Validation rules:
- `wa`: agent phone is required (di-derive dari `agents.phone`, bukan field tile).
- `umroh` / `umroh_landing` / `haji`: system tiles, tidak butuh field tambahan; selalu lulus validasi selama tile ada.
- `featured`: `jadwal_id` is required, dan harus matching salah satu paket aktif (jika tidak → status `ORPHAN`).
- `link`: `title` and `https://` URL are required.
- `text`: `content` is required.
- `photo`: uploaded `https://` image URL is required (via `/api/bio/:slug/photo-upload`).
- `testi`: `quote` and `author_name` are required.

Behavior:
- Add tile: creates `{ visible: true, config: {} }`, then opens the edit sheet.
- Toggle hidden → visible: validates required fields first; if invalid, shows notice and opens edit sheet.
- Autosave: preserves the user's `visible` flag; do not flip incomplete visible tiles to hidden as a workaround.
- Public page: filters `visible && !orphaned`; custom tile components also guard missing props with `return null`.

Empty/hidden states:
```
Empty: dashed rounded-2xl card with Inbox icon + "Belum ada bagian"
All hidden: amber notice + inline "Tampilkan" action for ready hidden drafts
Add button: mt-2 w-full py-3 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-600 font-semibold
```

Bio bottom bar:
```
fixed inset-x-0 bottom-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t
px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]
Inner: max-w-lg mx-auto grid grid-cols-[0.92fr_1.08fr] gap-2.5
Preview: white/emerald outline, Eye icon, text "Preview"
Lihat Bio: solid emerald, ExternalLink icon, text "Lihat Bio"
```

Tidak ada tombol Share di bottom bar Bio. Share/copy link tetap tersedia lewat `UrlCard`.

Full-screen Bio preview:
```
Portal: fixed inset-0 z-[9000] bg-gray-50 dark:bg-slate-950 flex flex-col
Header: safe-area top padding, title "Bio Publik", close button X
Phone frame: max-w-[390px], rounded-[2rem], border-[10px] gray-900
Iframe: width/height 111.111%, transform scale(0.9), origin-top-left
Footer CTA: full-width solid emerald "Buka Halaman Publik"
```

#### Crop Modal

Landing OG upload memakai `PhotoCropModal`:
- `aspect = 1200/630`
- `cropShape="rect"`
- `outputWidth=1200`, `outputHeight=630`
- `title="Crop Gambar Pratinjau"`
- `hint="Disarankan 1200 × 630 px"`
- `confirmLabel="Gunakan Gambar"`
- `quality=0.9`

#### Toast Notifications

```
fixed left-1/2 -translate-x-1/2 bottom-24 z-50
flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-md
text-[11.5px] font-medium max-w-[90vw] whitespace-nowrap
animation: fadeIn 150ms ease-out
Success: bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 text-emerald-800 + CheckCircle2 13
Error: bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 + AlertCircle 13
Auto-dismiss 2200ms for Bio notices, 3500ms for landing config toasts
```

---

## Umrah Self-Registration (`UmrahRegisterPage.tsx`)

Form pendaftaran jamaah umroh ke sistem internal legacy. Form structure di-scrape dari HTML (`GET /api/umrah/form-options`), rendered sebagai sections.

### Section Order & Titles

```
pendaftaran   → "Info Pendaftaran"
jamaah        → "Data Jamaah"
alamat        → "Alamat"
paket         → "Paket"
pendaftar     → "Info Pendaftar"
auto          → "Info Otomatis" (LOCKED fields: Jenis Daftar, Marketing, Koordinator)
lainnya       → "Lainnya"
```

### Input Styling (matches existing `Form Inputs`)

```
INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900
   border border-gray-200 dark:border-slate-700 rounded-xl text-sm
   focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none
   transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50'

INPUT_ERROR_CLASS (sama struktur, warna red-300/red-500/red-500)
```

Label (inline + right-aligned hint):
```
LABEL_CLASS_INLINE = 'flex items-center gap-1.5 text-xs font-semibold
                      text-gray-600 dark:text-slate-300 uppercase tracking-wide'
```

### Dummy-Fill Button (dev/testing nicety)

Emerald micro-button di sebelah label untuk isi otomatis:
```
DUMMY_BTN_CLASS = 'flex items-center gap-1 text-[10px] font-semibold
                   text-emerald-600 dark:text-emerald-400
                   hover:text-emerald-700 dark:hover:text-emerald-300
                   uppercase tracking-wide px-2 py-0.5 rounded-md
                   hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors'
```

Hidden untuk labels: `Jenis Kelamin`, `Tanggal Berangkat`, `Paket Umroh` (need real data, not dummy).

### SearchableSelect Component

Custom dropdown dengan built-in search (muncul jika options ≥ 8). Lock state saat field locked (`LOCKED_FIELD_LABELS`).

```
Trigger button:
  w-full px-3 py-2.5 bg-white dark:bg-slate-900 border rounded-xl
  text-sm text-left outline-none transition-all
  flex items-center justify-between gap-2 focus:ring-2
  Border: gray-200 (default) / red-300 (error) — focus-within accents
  Content: truncated display label + ChevronDown 16 (rotate-180 saat open)

Disabled (locked) state:
  bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700
  text-gray-500 dark:text-slate-400 cursor-not-allowed
  ChevronDown opacity-50

Dropdown panel (always mounted for animation):
  absolute left-0 right-0 top-full mt-1 z-40
  bg-white dark:bg-slate-800 rounded-xl border shadow-lg overflow-hidden
  origin-top transition-all duration-150 ease-out
  open: opacity-100 scale-100 translate-y-0
  closed: opacity-0 scale-95 -translate-y-1 pointer-events-none

Search input (shown when options.length >= 8):
  p-2 border-b border-gray-100
  Pill: flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-slate-900 rounded-lg
  Search 14 gray + input (bg-transparent text-xs) + clear X 12

Options list:
  max-h-60 overflow-y-auto
  Row: w-full flex items-start gap-2 px-3 py-2 text-xs
    selected: bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 font-semibold
    unselected: text-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700/50
    Check mark: 3.5×3.5 slot, Check 14 emerald strokeWidth=3
  Empty state: px-3 py-4 text-center text-[11px] text-gray-400 "Tidak ada hasil"
```

### Custom Filter Dropdown (`FilterDropdown`)

Dropdown filter custom (**BUKAN `<select>` bawaan browser**) — standar untuk semua
filter/pemilihan di dashboard. Trigger kompak + panel popover **beranimasi**, baris
opsi ter-highlight emerald + Check, dan search pill otomatis saat opsi ≥ 8.
Komponen bersama: `src/components/FilterDropdown.tsx` (default export, prop `variant: 'compact' | 'default'`). Dipakai di jadwal-paket header (`FilterHeader.tsx`, variant `default`) & brosur-jadwal (`BrochureSchedulePage.tsx`, variant `compact`). Tambah pemakaian baru lewat komponen ini, jangan copy-paste.

> **Aturan pasangan tetap:** trigger + panel + **animasi buka/tutup** adalah satu
> paket. Kalau diminta "sesuaikan dropdown", animasi di bawah ikut otomatis — bukan
> opsional.

**Trigger** (`<button>`, non-native — tiga varian via prop `variant`):
```
variant="mini"  (header pill super-kompak & kontrol inline; pengganti native select h-6/h-7/h-8):
  w-full h-7 flex items-center justify-between gap-1.5 text-[10px] font-bold rounded-lg px-2.5 border
  bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700  (skin sama dgn compact, beda ukuran)
  enabled: text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/70 ; ChevronDown 12

variant="compact"  (filter rows, mis. brosur-jadwal):
  w-full h-9 flex items-center justify-between gap-2 text-xs font-bold rounded-lg px-3 border
  bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700
  enabled: text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/70 ; ChevronDown 14

variant="default"  (page header, mis. jadwal paket):
  w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-xl border border-transparent
  bg-gray-100/80 dark:bg-slate-800/80
  enabled: text-gray-700 dark:text-slate-200 hover:bg-gray-200/80 dark:hover:bg-slate-700/80 ; ChevronDown 16

both: disabled → text-gray-400 dark:text-slate-500 cursor-not-allowed ; focus-visible:ring-2 ring-emerald-500/50
Isi: <span class="truncate">{label || '—'}</span> + ChevronDown
ChevronDown: rotate-180 saat open (transition-transform duration-150), opacity-50 saat disabled
a11y: aria-haspopup="listbox" + aria-expanded={open} + aria-label
```

**Panel + ANIMASI (WAJIB)** — panel **selalu mounted** supaya buka DAN tutup sama-sama beranimasi:
```
absolute left-0 right-0 top-full mt-1 z-40 origin-top
rounded-xl border border-gray-100 dark:border-slate-700
bg-white dark:bg-slate-800 shadow-lg overflow-hidden
transition-all duration-150 ease-out
open:   opacity-100 scale-100 translate-y-0
closed: opacity-0 scale-95 -translate-y-1 pointer-events-none
```
⚠️ Animasi HARUS pakai utilitas transisi **inti** Tailwind di atas. JANGAN pakai
`animate-in` / `fade-in-0` / `zoom-in-95` / `slide-in-from-*` — plugin
`tailwindcss-animate` **tidak terpasang** di project ini sehingga kelas-kelas itu
**no-op (tidak menghasilkan CSS)**.

**Aksesibilitas (karena panel selalu mounted):** saat tertutup set atribut native
`inert` + `aria-hidden` agar opsi tidak masuk tab order / a11y tree, dengan
`pointer-events-none` sebagai fallback pointer. React 18 belum mengenali `inert`
sebagai prop → set via ref di `useEffect([open])`:
`open ? el.removeAttribute('inert') : el.setAttribute('inert','')`.

**Search pill** (muncul saat `options.length >= 8`):
```
p-2 border-b border-gray-100 dark:border-slate-700
Pill: flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-slate-900 rounded-lg
Search 14 + input (bg-transparent text-xs) + clear X 12
Fokus input on open: focus({ preventScroll: true }) supaya sticky filter row tak loncat
```

**Options list:**
```
max-h-60 overflow-y-auto
Row: w-full flex items-start gap-2 px-3 py-2 text-xs text-left
  selected:   bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-semibold
  unselected: text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50
  Check slot: w-3.5 h-3.5 (mt-0.5); selected → Check 14 strokeWidth=3 emerald
Empty: px-3 py-4 text-center text-[11px] text-gray-400 dark:text-slate-500 "Tidak ada hasil"
```

**Behavior:** tutup saat klik di luar (`pointerdown` di luar root) atau `Escape`;
reset query tiap kali tertutup; pilih opsi → `onChange(value)` lalu `setOpen(false)`.

### KTP OCR Inline (Top of Form)

Integrated di atas section pertama. Upload KTP image → OpenAI Vision extract → auto-fill fields.

States:
- `form` — default
- `ocr-processing` — loading spinner + message

### Preview Modal (Pre-Submit)

```
Fullscreen modal (fixed inset-0 z-50 bg-black/50 backdrop-blur-sm)
Card: w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-2xl p-5
```

Digunakan untuk konfirmasi data sebelum submit ke legacy.

### Default Values (Auto-Fill)

- **Jenis Daftar** → "Jamaah Baru"
- **Jenis Kelamin** → "Laki-laki"
- **Pendamping (Keberangkatan)** → "Berangkat Sendiri"
- **Pengalaman Umrah** → "Belum Pernah"
- **tgl_daftar** → today (DD/MM/YYYY)
- Hidden: `mahram="X"`, `kondisi_jamaah="X"`, `keterangan="X"`, `tlp_pendaftar="1111111111"`

### Binding via `?idb=<id_umroh>` Query Param

Family/group registration — auto-select parent's jadwal, fetch dependent options, match parent's paket. Supporting params: `&from=<parent_nama>`, `&date=<parent_tgl_berangkat YYYY-MM-DD>`, `&paket=<parent_paket_label>`.

---

## Telegram Components

### Telegram Connect Banner (`TelegramConnectBanner.tsx`)

Dashboard-home CTA untuk agent yang belum menghubungkan Telegram. Banner tidak tampil saat status masih loading, status belum ada, atau Telegram sudah connected.

```
relative mb-4 rounded-xl border border-white/15
shadow-lg shadow-cyan-500/30 dark:shadow-cyan-500/40
p-4 overflow-hidden
background: linear-gradient(135deg, #2AA9E0, #229ED9, #16719E)
```

Visual layers:
- Decorative blurred circles in `white/10` and `cyan-200/20`
- Large `Send` icon watermark: `size=140`, `absolute -right-6 -bottom-8`, `text-white/[0.07]`, `rotate-12`
- Icon badge: `w-10 h-10 rounded-xl bg-white/15`, inner white circle, subtle ping ring
- Text: title `text-sm font-bold text-white`, subtitle `text-xs text-white/85`
- CTA: `px-3 py-2 rounded-lg bg-white text-[#229ED9] text-xs font-bold shadow-lg`, includes `ArrowRight` size 14

Copy:
- Title: "Layani jamaah dengan sigap!"
- Button: "Hubungkan"

### Status Badge (Connected)

Compact Telegram-brand badge used in `DashboardProfile.tsx` `TelegramSection`:

```
flex items-center gap-3 px-3.5 py-3 rounded-2xl
position: relative, overflow: hidden
background: linear-gradient(135deg, #2AABEE, #229ED9)  ← Telegram brand, NOT Tailwind blue
```

Inner elements:
- **Background ornament**: Telegram SVG logo `w-[90px] h-[90px]`, `fill: rgba(255,255,255,0.05)`, `absolute -right-[15px] -bottom-[25px]`, `rotate(-20deg)`
- **Icon**: `w-9 h-9 rounded-full bg-white/20`, glow ring `box-shadow: 0 0 0 3px rgba(255,255,255,0.1)`, float animation `tgFloat 3s ease-in-out infinite` (translateY 0→-2px→0)
- **Text**: title `text-[13px] font-bold text-white`, subtitle `text-[10px] text-white/75`
- **Green dot**: `w-2 h-2 rounded-full bg-green-400`, pulse-glow animation `tgPulseGlow 2s ease-in-out infinite`

### Notification Toggle List

Grouped by section (JAMAAH × 7, PAKET × 3, LAINNYA × 5):

```
Section header: text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mt-5 mb-2 px-1
Card: bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm
Row: px-4 py-3 flex items-center justify-between, border-b border-gray-50 dark:border-slate-700/50
```

Row inner:
- Emoji: `text-base flex-shrink-0 mt-0.5`
- Label: `text-sm font-semibold text-gray-700 dark:text-slate-200`
- Desc: `text-[11px] text-gray-400 dark:text-slate-500 mt-0.5`
- Toggle: `w-10 h-6 rounded-full` (emerald-500 on / gray-200 off), thumb `w-5 h-5 rounded-full bg-white shadow-sm`

Current keys:
- Jamaah: `jamaah_baru`, `departure`, `paspor`, `pelunasan`, `perlengkapan`, `manasik`, `birthday_digest`
- Paket: `seat_alert`, `paket_baru`, `perubahan_harga`
- Lainnya: `pembayaran_cicilan`, `pembayaran_pelunasan`, `ringkasan_mingguan`, `flight_status`, `kurs_dollar`
- Backend defaults also include legacy aggregate `pembayaran_masuk` and hidden `insight_harian`; keep compatibility when normalizing saved prefs.

### Disconnect Button

```
flex items-center justify-center gap-1.5 w-full py-3 mt-8
text-xs font-medium text-red-500 dark:text-red-400
active:opacity-70 transition-colors
```

Icon: `Unlink` (Lucide, size 14)

### Disconnect Confirmation Dialog

```
Backdrop: fixed inset-0 z-50 bg-black/50 backdrop-blur-sm
Wrapper: fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none
Card: w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border shadow-2xl p-5 text-center pointer-events-auto
```

Animation: scale `0.92→1` (open) / `1→0.92` (close), `cubic-bezier(0.16,1,0.3,1)` 250ms

### Telegram Tab Skeleton

Shown while `statusLoading === true` (before initial API response):

```
Status badge: h-14 w-full rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse
Section header: h-3 w-16/w-12 rounded-md animate-pulse
Toggle rows: px-4 py-3 with circle (w-8 h-8), text (h-3 w-28 + h-2.5 w-20), toggle pill (w-9 h-5)
All: bg-gray-200 dark:bg-slate-700 animate-pulse
```

---

## Birthday Components

Birthday workflow lives on dashboard home and is backed by `GET /api/jamaah/birthdays` for today + next 3 days in `Asia/Jakarta`.

### Birthday Widget (`BirthdayWidget.tsx`)

Compact card with a soft pink header and list rows for imminent birthdays.

```
bg-white dark:bg-slate-800 rounded-2xl
border border-gray-100 dark:border-slate-700
shadow-sm overflow-hidden
```

Header:
- Wrapper: `relative px-4 py-3.5 overflow-hidden`
- Background: `linear-gradient(180deg, rgba(244,114,182,0.08) 0%, transparent 100%)`
- Icon shell: pulse ring + `w-9 h-9 rounded-xl`, gradient `#f472b6 → #be185d`, pink shadow
- Title: `text-sm font-bold`; subtitle `text-[11px] text-gray-500`
- Day pill: `text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full`, pink tint for today

Birthday row:
```
w-full px-4 py-2.5 flex items-center gap-3
border-t border-gray-50 dark:border-slate-700/50
```

Row details:
- Avatar: `w-9 h-9 rounded-full`; female `bg-pink-100 text-pink-700`, male `bg-blue-100 text-blue-700`
- Today overlay uses pink birthday marker; age badge uses `text-[10px] font-bold px-2 py-0.5 rounded-md`
- "Lihat X lagi minggu ini" uses the existing emerald "Lihat Semua" expand button style.

### Birthday List Sheet (`BirthdayListSheet.tsx`)

Bottom sheet grouped by day. Uses the standard mobile sheet language:

```
fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg
bg-white dark:bg-slate-800 rounded-t-2xl
border-t border-x border-gray-100 dark:border-slate-700
max-h-[85vh] overflow-y-auto shadow-2xl
```

Backdrop: `fixed inset-0 z-50 bg-black/40 backdrop-blur-sm`. Keep the top handle sticky for long birthday lists.

### Birthday Detail Sheet (`BirthdayDetailSheet.tsx`)

Detail sheet for one jamaah with editable WhatsApp text, card template selection, download, and WhatsApp send.

```
Header avatar: w-12 h-12 rounded-full
Title: text-sm font-bold
Textarea: rows={10}, rounded-xl, border-gray-200 dark:border-slate-700
Footer buttons: Download card + Send WhatsApp
```

Export behavior:
- Hidden export nodes render both card templates at original size.
- Download uses `@zumer/snapdom` → JPEG `quality: 0.9`.
- WhatsApp send opens `wa.me` with text only; card image is downloaded/shared manually.
- Tracking events: `open_birthday_sheet`, `birthday_download`, `birthday_send`.

### Birthday Card Templates (`BirthdayCardTemplates.tsx`)

Fixed-size social cards:

```
CARD_W = 1080
CARD_H = 1080
```

Templates:
- `classic`: warm red/gold celebration layout.
- `islamic`: emerald/gold geometric layout.

Common structure:
- Jamaah name as main focus, age/day metadata as supporting text.
- Message block from editable WhatsApp text.
- Footer contains agent photo, name, verified badge, and Alhijaz logo.
- Use solid backgrounds and embedded SVG decoration so JPEG export has no transparency dependency.

---

## Form Inputs

### Text Input / Select

```
w-full px-3 py-2.5
bg-white dark:bg-slate-900
border border-gray-200 dark:border-slate-700
rounded-xl
text-sm
focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
outline-none
transition-all
text-gray-800 dark:text-white
placeholder:text-gray-400
disabled:opacity-50
```

### Hijriah Year Select (Compact — Header)

```
h-8 text-[10px] font-bold text-gray-600 dark:text-slate-300
bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700
rounded-lg px-2 pr-6 outline-none appearance-none cursor-pointer
```

### Password Input (with toggle)

```html
<div className="relative">
  <input className="... pr-10" />
  <button className="absolute right-3 top-1/2 -translate-y-1/2">
    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
  </button>
</div>
```

### Label

```
flex items-center gap-1.5
text-xs font-semibold
text-gray-600 dark:text-slate-300
mb-1.5
uppercase tracking-wide
```

---

## PIN Input (`PinInput.tsx`)

6-digit PIN entry component used in StatistikPage for PIN-gated access.

### Container

```
flex gap-2 justify-center
```

### Digit Box

```
w-10 h-12 rounded-xl border-2 text-center text-lg font-bold
transition-all duration-200
```

| State | Border | Background |
|-------|--------|-----------|
| Empty | `border-gray-200 dark:border-slate-700` | `bg-white dark:bg-slate-900` |
| Filled (●) | `border-emerald-500 dark:border-emerald-400` | `bg-emerald-50 dark:bg-emerald-900/20` |
| Active (focus) | `ring-2 ring-emerald-500/30` | same as filled |
| Error | `border-red-400 dark:border-red-500` | `bg-red-50 dark:bg-red-900/20` |

Hidden input: `type="tel"`, `maxLength={6}`, auto-focus, numeric filter

### PIN Gate (StatistikPage)

Overlay that blocks Statistik/komisi data until PIN is verified:

```
flex flex-col items-center justify-center py-12
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm
```

- Lock icon: `w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20` with `Lock` icon
- Title: `text-sm font-bold`
- Subtitle: `text-xs text-gray-400`
- PinInput component below
- Session: `pin_unlocked` in sessionStorage (1-hour validity)

---

## Register Page (`RegisterPage.tsx`)

Self-registration page at `/register` — mint-green themed, same Outfit font as LoginPage.

### Container

```
min-height: 100vh
background: #f0fdf4 (mint green)
font-family: 'Outfit', sans-serif
display: flex, align-items: center, justify-content: center
padding: 24px 20px
```

Decorative circles: `linear-gradient(135deg, #d1fae5, #a7f3d0)` top-right (opacity 0.6) + `linear-gradient(135deg, #6ee7b7, #34d399)` bottom-left (opacity 0.15)

### Form Inputs (Inline Style — Not Tailwind)

```css
.login-mint-input {
  width: 100%; padding: 14px 16px;
  background: #fff; border: none; border-radius: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
  font-size: 15px; font-weight: 500; color: #111;
  transition: all 0.25s ease;
}
.login-mint-input:focus {
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #10b981;
}
.login-mint-input.input-error {
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #ef4444;
}
```

### Slug Field (Composite Input)

```
alhijaz.co/ prefix (gray, non-editable) + slug input (bold)
border-radius: 14px, same shadow as standard inputs
```

### Submit Button

```
width: 100%; padding: 16px; background: #065f46; color: white;
border-radius: 14px; font-size: 15px; font-weight: 600;
hover: background #064e3b, translateY(-1px), box-shadow 0 8px 24px rgba(6,95,70,0.3)
```

### Success Screen

- CheckCircle2 icon (`size={28}`, color `#10b981`) inside `#d1fae5` circle
- Title: `fontSize: 22, fontWeight: 700, color: #064e3b`
- "Kembali ke Login" button: same style as submit

### Animations

```css
@keyframes fadeSlideIn { from { opacity: 0; translateY(8px); } to { opacity: 1; translateY(0); } }
@keyframes errorSlideIn { from { opacity: 0; translateY(-6px); } to { opacity: 1; translateY(0); } }
```

Icons: `Eye`, `EyeOff`, `ArrowRight`, `Loader2`, `CheckCircle2`, `ArrowLeft`, `User`, `Phone`, `Mail`

---

## CAPI Event Log (`CapiEventLog.tsx`)

Real-time Meta CAPI event log viewer, embedded in `CapiPage.tsx`.

### Header

```
flex items-center justify-between mb-2
Label: text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300
Count badge: text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-400
```

### Filter Select (Compact)

```
h-7 text-[10px] font-bold text-gray-600 dark:text-slate-300
bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700
rounded-lg px-2 pr-6 outline-none appearance-none cursor-pointer
```

Options: Semua, Purchase, Contact, PageView, Search, ViewContent

> Varian native lama (halaman Analytics). Untuk filter/pemilihan **baru**, jangan pakai
> `<select>` bawaan — pakai **Custom Filter Dropdown (`FilterDropdown`)** yang non-native
> + beranimasi (lihat section tersendiri di atas).

### Refresh Button

```
w-7 h-7 flex items-center justify-center rounded-lg
bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700
text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700
```

### Event Table

```
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden
table: w-full text-[11px]
```

| Column | Align | Style |
|--------|-------|-------|
| Waktu | left | `text-gray-400 dark:text-slate-500 whitespace-nowrap` |
| Event | left | `font-semibold text-gray-700 dark:text-slate-200` + optional sync badge |
| Status | left | OK: `text-[10px] font-bold text-emerald-600 dark:text-emerald-400`, Error: `text-red-500 dark:text-red-400` |
| Value | right | `font-semibold text-gray-700 dark:text-slate-200 tabular-nums` |

Sync badge: `text-[9px] font-bold uppercase px-1 py-px rounded bg-gray-100 dark:bg-slate-700 text-gray-400`

### Pagination

```
w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold
border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400
disabled:opacity-25 hover:bg-gray-50 dark:hover:bg-slate-700
bg-white dark:bg-slate-800
```

Page indicator: `text-[10px] text-gray-400 dark:text-slate-500 font-medium`

### Empty State

```
flex flex-col items-center justify-center py-16 text-gray-400 dark:text-slate-500
Inbox icon (size 24, opacity-40) + text-xs + text-[10px]
```

### Auto-Refresh

- Interval: 30 seconds
- Pauses when `document.hidden` (tab not visible)
- 20 items per page

---

## Simulasi Haji Plus (`SimulasiHajiPlus.tsx`)

Haji Plus pricing calculator with package selection, export, and share.

### Package Selection Cards

Two packages with room-type pricing. Quad is the default:

- RAHMAH: Double $17,400, Triple $16,400, Quad $15,700
- UHUD: Double $14,000, Triple $13,000, Quad $12,500

```
p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200
Selected: border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-lg
Unselected: border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800
```

Star rating: `text-amber-400` (filled) / `text-gray-200` (empty)

### Calculator Controls

- Year selector: `select` with years starting 2035
- Jamaah count: `+`/`-` buttons with number display
- Name input: text field for jamaah name

### Result Card (Export Target)

```
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-5
```

Contains: package summary, DP amount ($4,500/person), total cost (USD + IDR), payment deadline, inflation projection (1.5%/year)

### Export & Share

- Uses `modern-screenshot` (`domToPng` with `{ scale: 3, quality: 1 }`)
- Share via `navigator.share({ files: [file] })`
- Framer Motion animations for modal transitions

### Preview Modal (Full-screen)

```
fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col
```

- Framer Motion `y: '100%' → 0`, spring damping=28 stiffness=300
- Share CTA + close button

---

## PackageCard Flag Overlay

Country flag images displayed as semi-transparent background overlays on package cards.

### Flag Assets (`public/flags/`)

| Country | File | Detection |
|---------|------|-----------|
| Saudi Arabia | `saudi.png` | Default for regular packages |
| Turkey | `turki.png` | Package name contains Turkey/Turki |
| Egypt | `mesir.png` | Package name contains Mesir/Kairo |
| China | `china.png` | Package name contains China |
| UAE | `uae.png` | Package name contains Dubai/Abu Dhabi |

### Overlay Style

```
absolute inset-0 pointer-events-none
opacity: 0.06 (light) / 0.04 (dark)
background-size: cover
background-position: center
```

Gradient overlay: `linear-gradient(to bottom, transparent, white)` / `linear-gradient(to bottom, transparent, slate-800)` for dark mode

---

## PackageCard Variants

Public package cards can be rendered in multiple visual variants through `CardVariants.tsx`. The agent preference is saved as `agents.card_variant`; public rendering fetches `/api/agent/:slug/card-variant` and SSR can inject `data-agent-card-variant` for first paint consistency.

### Variant Set

| Key | Usage |
|-----|-------|
| `default` | Existing compact card layout |
| `split` | Image/info split composition |
| `spotlight` | Large image-forward hero card |
| `ticket` | Travel ticket-inspired layout |
| `tiled` | Grid/tile arrangement |
| `magazine` | Editorial package presentation |

`PackageCard` should force `default` while `isCapturing` so downloaded/shared package images stay stable.

### DashboardProfile Picker

The "Tampilan Card" control in `DashboardProfile.tsx` opens a full-screen picker.

Closed row:
```
w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
border border-gray-200 dark:border-slate-700
hover:border-emerald-300 dark:hover:border-emerald-700
```

Preview thumbnail:
```
w-10 h-14 rounded-md border border-gray-200 dark:border-slate-700 overflow-hidden
```

Fullscreen picker:
```
fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col
Header: sticky top-0 px-4 py-3 border-b, close X + title
Grid: grid grid-cols-3 gap-3 p-4
Card: rounded-xl border p-2 active:scale-95 transition-all
Selected: border-emerald-500 ring-2 ring-emerald-500/20
Bottom bar: sticky bottom-0 p-4 border-t bg-white dark:bg-slate-900
```

Mini preview cards use `h-20`, compact typography, and variant-specific layout cues rather than full package content.

---

## Icons

**Library**: [Lucide React](https://lucide.dev/) — seluruh project menggunakan Lucide.

### Common Sizes

| Usage | Size | strokeWidth |
|-------|------|-------------|
| Label inline | `12` | default |
| Button icon | `16` | default |
| Header icon | `18` | `2.5` |
| Feature card | `22` | `1.8` |
| Loading spinner | `16`–`24` | default |

### Frequently Used Icons

| Icon | Usage |
|------|-------|
| `Loader2` + `.animate-spin` | Loading state |
| `Eye` / `EyeOff` | Password toggle |
| `LogIn` / `LogOut` | Login / Disconnect |
| `LayoutDashboard` | Dashboard button (header) |
| `CalendarRange` | Jadwal menu (dashboard) |
| `ExternalLink` | External link indicator |
| `ChevronLeft` / `ChevronRight` | Navigation |
| `ChevronDown` | "Lihat semua" expand |
| `Search` | Filter submit |
| `Calendar` | Date-related |
| `User` / `Users` | Profile / Agent |
| `UserPlus` | Jamaah baru (Statistik) |
| `Settings` | Config / CAPI |
| `ArrowLeftRight` | Compare |
| `BarChart3` | Statistik menu |
| `Building2` | Kantor |
| `Moon` / `Sun` | Dark mode toggle |
| `Shield` | Admin badge |
| `Wallet` | Komisi |
| `Plane` | Berangkat segera |
| `RefreshCw` | Sync ulang |
| `X` | Close modal/dialog |
| `Send` | Telegram tab (segmented control) |
| `Code` | CAPI tab (segmented control) |
| `Unlink` | Disconnect Telegram |
| `Sparkles` | AI Tools menu, generate script |
| `Mic` | Voice Over Generator |
| `FileImage` | Brosur Jadwal tool and sub-page header |
| `Image` | Brochure/image-related actions |
| `WandSparkles` | Generate prompt/script CTA |
| `Palette` | Design settings |
| `MonitorSmartphone` | Agent identity / preview context |
| `Gift` | Birthday widget and birthday detail |
| `Share2` | Share Kurs, public share actions |
| `Download` | Image/card/audio download actions |
| `Copy` | Copy caption/message |
| `DollarSign` / `Banknote` | Kurs and currency actions |
| `ArrowRight` | Telegram connect CTA, row navigation |
| `Play` / `Pause` | Audio player controls |
| `Package` | "Dari Paket" mode toggle |
| `PenLine` | "Tulis Manual" mode toggle |
| `Lock` / `Unlock` | PIN gate / PIN verified |
| `KeyRound` | PIN settings |
| `CheckCircle2` | Registration success |
| `Inbox` | CAPI event log empty state |
| `ArrowLeft` | Back navigation (RegisterPage) |
| `Info` | Simulasi Haji Plus info |
| `FileText` | PDF preview (Simulasi) |

### WhatsApp Icon (Custom SVG)

Used in `StatistikPage.tsx`, `AgentProfile.tsx`, and `HajiPage.tsx` — inline SVG `WaIcon` component, not from Lucide:
```tsx
<svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
  <path d="M17.472 14.382c-.297-.149..." />
</svg>
```

### Telegram Icon (Custom SVG)

Used in `DashboardProfile.tsx` (TelegramSection badge + CTA) — inline SVG, not from Lucide:
```tsx
<svg width="18" height="18" viewBox="0 0 24 24" fill="white">
  <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12..." />
</svg>
```

---

## Error Messages

### Inline Error (Form)

```html
<div className="flex items-center justify-center gap-1.5 py-2">
  <svg width="14" height="14" fill="none" ...>
    <path d="M12 9v3.75m9..." />
  </svg>
  <span className="text-xs font-medium text-red-500">{error}</span>
</div>
```

### Block Error (Section)

```
p-3
bg-red-50 dark:bg-red-900/20
border border-red-200 dark:border-red-800/50
rounded-xl
text-xs text-red-600 dark:text-red-400
font-medium text-center
```

### Block Error (Full page — Statistik)

```
p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center
```

---

## Loading States

### Spinner (Centered)

```html
<div className="flex items-center justify-center py-20">
  <Loader2 size={24} className="animate-spin text-emerald-500" />
  <span className="ml-2 text-sm text-gray-500">Loading text...</span>
</div>
```

### Button Loading

```jsx
{loading ? (
  <><Loader2 size={16} className="animate-spin" /> Memproses...</>
) : (
  <><Icon size={16} /> Label</>
)}
```

---

## Progress Bars

### Payment Progress (Jamaah)

```
h-3 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden
  └─ h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500
```

### Komisi 3-Segment Bar (Statistik)

```
h-3 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden flex
  └─ bg-emerald-500 (Sudah Cair)
  └─ bg-blue-400 (Belum Cair)
  └─ remaining space = Potensi
```

Legend dots: `w-2 h-2 rounded-full bg-{color}` + `text-[10px] font-medium`

---

## Dark Mode

- Toggled via `<html class="dark">` (class strategy)
- Stored in `localStorage('darkMode')`
- Pattern: every Tailwind class has a `dark:` counterpart
- Common pairs:
  - `bg-white` → `dark:bg-slate-800`
  - `bg-gray-50` → `dark:bg-slate-900`
  - `text-gray-800` → `dark:text-white`
  - `text-gray-500` → `dark:text-slate-400`
  - `border-gray-100` → `dark:border-slate-700`

---

## Animations & Transitions

| Pattern | Class |
|---------|-------|
| Button press | `active:scale-95` atau `active:scale-[0.97]` |
| Hover lift | `hover:-translate-y-0.5 hover:shadow-lg` |
| Transition | `transition-all duration-200` atau `transition-colors` |
| Pulse dot | `w-2 h-2 rounded-full bg-emerald-500 animate-pulse` |
| Spin loader | `animate-spin` (Lucide `Loader2`) |
| Spin refresh | `animate-spin` (Lucide `RefreshCw` — saat syncing) |
| Pulse text | `animate-pulse` (saat syncing) |
| Page transition | Curtain overlay (see `index.css`) |
| Modal fade-in | `fadeIn 150ms ease-out` |
| Modal slide-up | `slideUp 200ms ease-out` |
| Bottom sheet slide-up | Framer Motion `y: '100%' → 0`, 250ms, ease `[0.4, 0, 0.2, 1]` |
| Tanya AI modal slide-up | Framer Motion `y: '100%' → 0`, 320ms, ease `[0.32, 0.72, 0, 1]` |
| Disconnect modal | `dcModalIn/Out` — `scale(0.92→1)` 250ms `cubic-bezier(0.16,1,0.3,1)` |
| Chart bar transition | `transition-all duration-500` |
| Diskusi border glow | `.diskusi-ai-border::before` — rotating conic emerald ring via mask-composite, `ai-rotate 2.8s linear infinite` |
| Tanya AI typing dots | `askAiTyping 1.2s infinite ease-in-out` (3 dots, delays 0/0.15/0.3s) |
| Tanya AI typewriter | 22ms per word, cursor `w-[2px] h-3.5 bg-emerald-500 animate-pulse` |
| Birthday icon pulse | `birthdayPulse` ring on dashboard birthday widget icon |

---

## Custom CSS (index.css)

| Feature | Class / Selector |
|---------|-------------------|
| Line clamp | `.line-clamp-1`, `.line-clamp-2` |
| Hide scrollbar | `.no-scrollbar` |
| Mask gradient | `.mask-image-gradient` |
| AI button glow | `.ai-border-glow` (conic gradient, rotating) |
| Page transition overlay | `.page-transition-overlay` |
| Legacy table styling | `.laporan-content table/th/td` |
| Disconnect modal anims | `dcOverlayIn/Out`, `dcModalIn/Out` (inline `<style>` in component) |
| Telegram badge anims | `tgFloat` (icon bob), `tgPulseGlow` (green dot pulse) (inline `<style>`) |
| Birthday widget anims | `birthdayPulse` icon ring (inline `<style>` in `BirthdayWidget`) |
| Register form anims | `fadeSlideIn` (form entry), `errorSlideIn` (error msg) (inline `<style>`) |
| Diskusi button ring | `.diskusi-ai-border`, `@keyframes ai-rotate`, `@property --ai-angle` (rotating conic gradient, mask-composite xor to cut center) |
| Tanya AI typing dots | `@keyframes askAiTyping` (scoped inline `<style>` inside `AskAIModal`) |
| Icon animations | `animate-icon-twinkle`, `animate-icon-float`, `animate-icon-breathe`, `animate-icon-rise`, `animate-icon-wiggle`, `animate-icon-spin-slow` (Dashboard menu cards & Sparkles icon on Diskusi) |

---

## Image Export & Native Share

### Export Strategy
- Use the exporter already chosen by each feature:
  - `modern-screenshot` for Brosur Jadwal (`domToCanvas` fixed 1080×1620), Compare share (`domToBlob`), Haji Plus export/simulasi (`domToPng` with high scale), and other DOM-to-PNG export surfaces that need broad CSS support.
  - `@zumer/snapdom` for fixed-size social/card images: PackageCard share image, Share Kurs, Birthday cards, and Kartu Nama Digital.
- For `snapdom`, capture the fixed original-size node and export JPEG (`quality: 0.9`) when the design has a solid background.
- Wait for `document.fonts.ready` and image decode/load before snapshotting. Use a short fallback delay only after font/image readiness has been attempted.
- Result should be rasterized to `Blob`/`File` before download/share.
- **CSS Grid + Flexbox Warning**: DOM image exporters can struggle to compute heights for flex-nested elements within grid rows, causing vertical overlapping of text/divs. When building layouts specifically for image exports, prefer using standard block-level stacking inside grid cells rather than `display: flex` and explicit alignment. Use exact sizes (`px` widths) or simpler table models to avoid clipping or wrapping issues.

### Native Share Format
- WhatsApp requires the sharing payload to **only contain the `files` array**.
- **Crucial**: Adding `text`, `title`, or `url` will cause a widespread "double-image" bug or failure on mobile share sheets.
```ts
// CORRECT:
navigator.share({ files: [file] });

// INCORRECT (Causes double image/fail):
navigator.share({ files: [file], text: 'Caption', title: 'Infografis' });
```

### SVG Compatibility for Export
- Always use **fill-based paths** instead of stroke-based primitives.
- DOM image exporters may fail to accurately rasterize SVG stroke properties.
- Example: Convert `<circle>` or `<path stroke="..." />` to `<path d="..." />` filled with exact color/opacity.

---

## Flight Status Card (`FlightStatusCard.tsx`)

Real-time flight tracking card on dashboard home.

### Card Container

```
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden
```

### Flight Header (Clickable)

```
w-full px-3 py-2.5 flex items-center gap-2.5
active:bg-gray-50 dark:active:bg-slate-700/50 transition-colors
```

Layout: Time column (dep → arr) → Flight info (number + status badge + route SVG) → Date + terminal → Chevron

### Status Badge Colors

| Status | Background | Label |
|--------|-----------|-------|
| Scheduled | `bg-gray-400` | Terjadwal |
| En-Route | `bg-blue-500` | Terbang |
| Landed | `bg-emerald-500` | Mendarat |
| Delayed | `bg-red-500` | Tertunda |
| Cancelled | `bg-gray-400` | Dibatalkan |

Badge style: `text-[8px] font-bold uppercase px-1.5 py-[2px] rounded-md text-white tracking-wide`

### Route SVG (RouteLine)

Custom inline SVG (`height: 12px, width: 48px`) with animated status-specific line:
- Scheduled: dashed blue animating
- En-Route: solid blue (traveled) + dashed gray (remaining) + pulsing plane dot
- Landed: solid green + checkmark pop animation
- Delayed: dashed red animating

### Kloter Row

```
flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-900 rounded-lg
```

Group badge: `text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 rounded-md px-2 py-0.5`

### Share Button

```
w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold
// Default: bg-gray-50 dark:bg-slate-800 text-gray-600 border border-gray-200
// Success: bg-emerald-50 text-emerald-600 border border-emerald-200
```

### Live Badge

```
flex items-center gap-1.5 px-2 py-1 rounded-full
bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40
```

Pulsing green dot: `animate-ping` overlay + solid `bg-emerald-500`

---

## Flight Share Page (`FlightSharePage.tsx`)

Public page at `/f/:code` — branded flight status for jamaah.

### Header

Two-layer header with red gradient:

```
background: linear-gradient(135deg, #dc2626, #991b1b)
```

Layer 1: White Alhijaz logo (left) + Share icon (right)
Layer 2: Flight number + airline name + status badge

### Hero Card

```
mx-4 -mt-3 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg
bg-white dark:bg-slate-800 overflow-hidden
```

Route visualization: departure city → dashed line with plane icon → arrival city
Flight date: `text-[11px] font-medium text-gray-400`

### Map Section

Full-width Leaflet map with arc polyline:
- Custom markers: red (departure) + red (arrival)
- Arc path: `dashArray: '6, 4'` with red stroke
- Map bounds: auto-fit to both airports

### Boarding Pass Section

```
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm
```

Styled like a real boarding pass — dotted perforated line, departure/arrival blocks with times, gate/terminal badges

### Weather Section

Dark mode gradient card for destination weather:

```
background: linear-gradient(135deg, #0f172a, #1e293b)
rounded-2xl p-4
```

Weather icon (from code), temperature, humidity, high/low badges

### Agent Contact Section

Red gradient matching header:

```
background: linear-gradient(135deg, #dc2626, #991b1b)
rounded-2xl overflow-hidden
```

Agent photo + name + WhatsApp CTA button with WhatsApp SVG icon

---

## Cuaca Widget (`CuacaWidget.tsx`)

Compact weather pill cards on dashboard home.

### Widget Container

```
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm
```

### City Pill

```
flex items-center gap-2 px-3 py-2.5 rounded-xl
bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700/50
```

Layout: Flag emoji → City code (bold) → Temperature → Weather icon

---

## Kurs Widget

Compact currency pill on dashboard home showing USD/SAR sell rates.

### Rate Pill

```
flex items-center gap-2 px-3 py-2 rounded-xl
bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700/50
```

Layout: Flag → Currency code (bold, larger) → Rate value

Date display: value dari API `kursData.updatedAt`.

### Header Action Buttons

Header sebelah kanan dari Kurs widget berisi tombol outline kecil. Tombol Share tersedia untuk semua agent selama `kursData.usd !== null`.

```
flex items-center gap-1 px-2.5 py-1.5 rounded-lg
border border-gray-200 dark:border-slate-600
text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold
hover:bg-gray-50 dark:hover:bg-slate-700 active:scale-95 transition-colors
```

| Button | Visibility | Icon | Label |
|--------|-----------|------|-------|
| Share | All agents (`kursData.usd != null`) | `Share2` 10 | "Share" |
| Kurs (open `/dashboard/ai-tools/kurs`) | All | — / `ChevronRight` 10 right | "Kurs" |

---

## Share Kurs Modal (`ShareKursModal.tsx`)

Full-screen modal untuk generate infografis kurs harian. Implementasi terbaru memakai **single Hero USD template** 16:10. Preview tetap dirender di browser, tetapi file final Download/Share diambil dari endpoint server-side on-demand agar hasil konsisten antar perangkat. Lazy-loaded via `React.lazy` + `Suspense` di `DashboardLayout.tsx`.

### Trigger

Tombol "Share" pada Kurs widget header. Hanya muncul ketika `kursData.usd != null`.

### Container

```
Portal: createPortal ke document.body
Root: fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col
Animation: Framer Motion opacity + `y: '100%' → 0`
ESC key + body-lock (overflow: hidden) saat open
```

Header:
```
sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl
border-b border-gray-200/60 dark:border-slate-700/60
px-5 py-4 flex justify-between items-center shadow-sm
Title: text-lg font-bold "Bagikan Kurs"
Close: p-2 bg-gray-100 dark:bg-slate-800 rounded-full
```

Scrollable body:
```
flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 px-5 py-6
Preview shell: max-w-xl mx-auto bg-white dark:bg-slate-800 rounded-2xl border shadow-sm p-3
```

### Canvas & Preview

- **Fixed canvas**: `TEMPLATE_W = 1400`, `TEMPLATE_H = 1000` (16:10)
- **Preview scale**: computed dari container width, min 280px, max 520px.
- `PREVIEW_FRAME_INSET = 32`; `targetW = clamp(containerW - inset, 280, 520)`.
- Render template via `transform: scale(previewScale)` + `transform-origin: top left`; export node tetap ukuran asli 1400×1000.

```
borderRadius: 12
overflow: hidden
boxShadow: 0 8px 32px rgba(0,0,0,0.18)
```

### Template — Hero USD 16:10

Props:
```ts
{
  kurs: { usd: number; updatedAt: string };
  agent: { name: string; phone: string; photo: string; slug: string; website?: string };
}
```

Visual:
- Background radial emerald/gold glow + diagonal emerald gradient `#054233 → #0F6E56 → #064e3b`.
- Geometric Islamic line pattern as inline SVG overlay.
- Top row: title "Kurs Hari Ini", subtitle "Update nilai tukar USD ke Rupiah", Alhijaz logo white on right.
- Hero rate: US flag pill + "USD / US Dollar"; giant rate digits with `Rp` prefix and "per 1 USD" underline.
- Bottom glass panel: agent avatar, name + verified check, website/WA fallback, date pill with calendar icon.
- Template intentionally USD-only; SAR tetap ditampilkan di widget/page kurs jika data tersedia, tetapi tidak wajib untuk share image.

### Action Buttons (footer)

Footer sticky di bawah:

```
sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200/60 dark:border-slate-700/60 p-4
Inner: max-w-md mx-auto space-y-2
Row: grid grid-cols-2 gap-2 when native share exists, grid-cols-1 otherwise
Download: bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20
Bagikan: border border-emerald-500 text-emerald-600 dark:text-emerald-400
Salin Caption: border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300
Common: flex items-center justify-center gap-2 rounded-xl text-sm font-bold active:scale-95 disabled:opacity-50
```

### Export Flow

- `ShareKursModal` fetch `GET /api/kurs/share-image` dengan auth token.
- Server memakai `lib/kurs-share-cache.mjs` → `lib/kurs-image-generator.mjs` untuk render Playwright JPEG 1400×1000.
- Hasil disimpan sebagai cache disk di `data/kurs-share-cache/{YYYY-MM-DD}/` dan key berubah saat kurs, template version, foto/nama/kontak/website agent berubah.
- Cache default: TTL 3 hari (`KURS_SHARE_CACHE_TTL_DAYS`), size cap 512 MB (`KURS_SHARE_CACHE_MAX_MB`), cleanup saat startup + harian 03:30 WIB.
- Output blob → `File('kurs-YYYYMMDD.jpg', { type: 'image/jpeg' })`
- JPEG quality: 88 server-side; transparency tidak diperlukan karena template punya solid background.
- Native share: `navigator.share({ files: [file] })` — hanya `files`, tanpa `text/title/url`.
- Download: trigger `<a download>` dengan `URL.createObjectURL(blob)`
- Copy caption: build string dari `kurs.updatedAt`, USD rate, `agent.name`, `wa.me/{phone}`, dan website/WA fallback.

### Font Handling

`ShareKursModal` menunggu `document.fonts.ready` sebelum capture. Template memakai Inter/system stack; tidak lagi bergantung pada DM Serif Display/Amiri.

### Toast Feedback

```
fixed bottom-28 left-1/2 -translate-x-1/2 z-[10000]
bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl
Auto-dismiss: 2500ms
```

### Analytics

```ts
trackEvent('feature', 'open_share_kurs');  // ketika modal open
trackEvent('action', 'download_share_kurs');
trackEvent('action', 'share_kurs');
trackEvent('action', 'copy_kurs_caption');
```

---

## Analytics Components

### Agent Drill-Down Modal (`AgentDrillDownModal.tsx`)

Admin-only modal opened from analytics agent rows. Data covers the last 7 days and is fetched from `/api/analytics/agent/:slug`.

```
Backdrop: fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm
Sheet: fixed bottom-0 left-0 right-0 z-[56] mx-auto max-w-lg
bg-white dark:bg-slate-900 rounded-t-2xl
border-t border-x border-gray-100 dark:border-slate-700
max-h-[92vh] overflow-y-auto shadow-2xl
```

Header:
- Agent avatar/photo, name, and slug.
- Subtitle: "Aktivitas 7 hari terakhir".
- Close button uses the standard `X` icon button.

Body modules:
- Summary stat cards for views, WA clicks, inquiries, and AI actions.
- Timeline chart using Recharts `BarChart`.
- 24-hour heatmap grid with emerald intensity.
- Feature/action breakdown lists.
- Funnel summary.
- Recent events list with compact metadata.

Use dense card spacing (`space-y-3`, `p-3.5`) because this modal is operational, not editorial.

---

## Portal Jamaah (`src/components/portal-jamaah/`)

Jamaah-facing companion app diakses via `/:slug/jamaah[/<magic-code>][/dashboard]`. Independent dari design tokens dashboard agent — pakai layout `max-w-lg` yang sama, namun dengan signature glassmorphism + emerald gradient yang membedakan branding "untuk jamaah" vs "untuk agent". Dark mode toggleable per session jamaah (independent), persisted di sessionStorage via `usePortalTheme`.

### Sticky Headers — Glassmorphism Pattern

Semua header portal pakai pattern glassmorphism yang sama (PortalTopBar + PortalBackBar). Berbeda dari dashboard header (`bg-white/90`) — portal pakai backdrop saturate + ring border tipis untuk kesan "frosted glass".

```
sticky top-0 z-30
border-b border-white/60 dark:border-white/10
bg-white/70 dark:bg-slate-950/70
shadow-sm shadow-slate-900/5 dark:shadow-black/20
backdrop-blur-xl backdrop-saturate-150
```

#### `PortalTopBar.tsx`
Inner: `max-w-lg mx-auto px-4 py-3 flex items-center justify-between`. Kiri = Alhijaz logo + title, kanan = optional right-slot (ThemeToggle, dll).

#### `PortalBackBar.tsx`
Identik PortalTopBar tapi center berisi judul halaman. Back button kiri:
```
flex items-center justify-center h-11 w-11 rounded-xl
bg-white/10 border border-white/60 dark:border-white/10
text-slate-700 dark:text-slate-200
```
Title: kecil "Halaman" + bold judul. Pakai di sub-pages (Perjalanan, Pembayaran, dst).

### `HeroCountdown.tsx` — Departure Timer

Card hero di Beranda dengan countdown ke tanggal keberangkatan. Visual paling kaya di portal.

```
relative overflow-hidden rounded-2xl
border border-emerald-200/10
p-5 text-white
shadow-lg shadow-emerald-950/15
```

Background: multi-layer
1. Linear gradient base `from-emerald-700 via-teal-700 to-emerald-800`
2. Radial gradient overlay (teal undertone, top-right glow)
3. Decorative SVG pattern overlay (opacity-10)
4. Floating blur-glow circle bottom-right (`bg-emerald-400/20 blur-3xl`)

Konten: label uppercase "Berangkat dalam" + countdown digit besar (`text-3xl font-bold`) + tanggal long format + flight info row (kode pesawat, jam) di bawah.

### `PortalMenuCard.tsx` & `PortalMenuGrid.tsx` — Menu Tiles

Grid 3×3 tiles dengan accent color per kategori (`PORTAL_MENUS` constant di `portal-jamaah/lib/portalMenu.ts`). Pakai frosted glass overlay supaya tidak terlalu jenuh.

#### Grid Container
```
grid grid-cols-3 gap-3
```

#### Card
```
group relative aspect-square overflow-hidden rounded-2xl
border p-3.5 shadow-sm
transition-all duration-200
active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-xl
${menu.cardBg} ${menu.cardBorder}
```

Layer dalam:
- Frosted overlay: `absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none`
- Icon wrap (`ring-1` warna senada): `h-9 w-9 rounded-xl ${menu.iconBg} ring-1 ring-inset ${menu.iconRing}`
- Floating blob top-right: `absolute -top-4 -right-4 h-16 w-16 rounded-full ${menu.blob} opacity-20 group-hover:opacity-30 transition-opacity blur-xl`
- Label bawah: `text-[11px] font-semibold text-slate-700 dark:text-slate-100 leading-tight`

#### Accent Per Menu (`PORTAL_MENUS`)

| Menu | iconBg | cardBg | accent |
|------|--------|--------|--------|
| Perjalanan | `bg-emerald-100/80` | `bg-emerald-50/70` | emerald |
| Pembayaran | `bg-amber-100/80` | `bg-amber-50/70` | amber |
| Dokumen | `bg-blue-100/80` | `bg-blue-50/70` | blue |
| Perlengkapan | `bg-violet-100/80` | `bg-violet-50/70` | violet |
| Manasik | `bg-purple-100/80` | `bg-purple-50/70` | purple |
| FAQ | `bg-pink-100/80` | `bg-pink-50/70` | pink |

### `SmartAlertsStrip.tsx` — Tone-Aware Alerts

Banner alerts di Beranda. Setiap alert punya `tone` (red/amber/violet/purple) yang menentukan bg+icon+text.

Wrapper: `space-y-2.5`

Per-alert button:
```
flex w-full items-center gap-3 rounded-2xl border p-4 text-left
transition active:scale-[0.98]
${tone.card}
```

Tone tokens (red contoh):
```js
{
  card: 'bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800/40',
  iconWrap: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  text: 'text-red-700 dark:text-red-200'
}
```

Icon wrap: `h-10 w-10 rounded-xl flex items-center justify-center`. Chevron `ChevronRight` ukuran 18 di kanan sebagai indikator clickable.

### `TaskListWidget.tsx` — Urgent Tasks

List task per kategori (pembayaran, dokumen, perlengkapan, manasik) dengan icon color match kategori.

Wrapper: `space-y-3`

Per-task:
```
flex w-full items-center gap-3 rounded-xl
border border-gray-100 bg-white p-4 text-left shadow-sm
transition active:scale-[0.98]
hover:border-emerald-100
dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700
```

Icon wrap: `h-10 w-10 rounded-xl` dengan accent kategori (sky/amber/violet/purple). Empty state: emerald checkmark "Semua tugas tuntas, semoga lancar ya".

### `StickyWhatsAppCta.tsx` — Pill Footer

Persistent floating CTA WhatsApp ke agent. Muncul-hilang berdasarkan scroll direction.

```
fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto
bg-gradient-to-r from-emerald-50 via-white to-white
dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800
backdrop-blur-md
border border-emerald-100 dark:border-emerald-800/50
shadow-2xl rounded-full
flex items-center justify-between p-2 pl-3
transition-all duration-300 ease-in-out
```

State: `translate-y-0 opacity-100` (visible, scroll up) / `translate-y-24 opacity-0 pointer-events-none` (hidden, scroll down). Trigger berdasarkan `useScrollDirection` hook lokal.

### `RosterItem.tsx` — Jamaah Roster Card

Item per anggota jamaah dengan avatar, gender ring, payment status overlay, dan progress bar prep.

```
flex items-center gap-3 rounded-2xl
border border-gray-100 bg-white p-4 shadow-sm
dark:border-slate-700 dark:bg-slate-800
```

Avatar: `h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30` + ring gender (`ring-2 ring-pink-300` P, `ring-2 ring-blue-300` L). Corner badge status:
- Lunas → `bg-emerald-500` ✓
- DP → `bg-blue-500` clock
- Belum → `bg-amber-500` "?"

Progress bar prep (di bawah nama):
- 100% → `bg-emerald-500`
- ≥50% → `bg-amber-500`
- < 50% → `bg-rose-500`

### `JamaahPaymentCard.tsx` — Payment Summary

```
rounded-2xl border border-slate-100 bg-white p-4 shadow-sm
dark:border-slate-700 dark:bg-slate-800
```

Header: avatar + nama + status badge. Body: nominal sudah bayar + sisa. Footer: progress bar amber (`bg-amber-500`) jika masih ada sisa, emerald jika lunas.

### `FlightCard.tsx`, `HotelCard.tsx`, `ItineraryList.tsx` — Travel Cards

Pattern data card neutral untuk halaman Perjalanan.

```
rounded-2xl border border-gray-100 bg-white p-4 shadow-sm
dark:border-slate-700 dark:bg-slate-800
```

Header umum: icon wrap `h-10 w-10 rounded-xl` + uppercase label `text-[10px] font-semibold tracking-wide text-slate-500` + title `text-sm font-bold`.

- **FlightCard**: icon emerald (`bg-emerald-50 text-emerald-600`), label "KEBERANGKATAN"/"PULANG", code badge kanan (`bg-gray-100 px-2 py-1 rounded-md text-xs font-mono`).
- **HotelCard**: icon slate neutral (`bg-slate-100`), label "MEKKAH"/"MADINAH", lokasi `MapPin` + room type.
- **ItineraryList**: day badges (`h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 font-bold text-xs`) "D1", "D2", dst. Dividers `border-b border-gray-100`. "Lihat semua hari" expand button jika > 3 hari.

### `ThemeToggle.tsx`

```
flex h-9 w-9 items-center justify-center rounded-lg
bg-gray-100/80 dark:bg-slate-800/80
text-gray-500 dark:text-slate-300
transition-colors hover:bg-gray-200 dark:hover:bg-slate-700
active:scale-95
```

`Sun` icon (light) atau `Moon` icon (dark). State persisted via `usePortalTheme` → sessionStorage key.

### `AgentHeaderBar.tsx`

Header bar di halaman LandingPage (sebelum login magic link) yang menampilkan info agent.

```
border-b border-slate-100 bg-white
flex items-center justify-between px-4 py-3
```

Light-only (tidak ada dark variant di komponen ini karena LandingPage sendiri sudah pakai bg netral). Avatar `h-10 w-10 bg-emerald-50` fallback initials emerald, badge kanan `bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full` = "Alhijaz".

### `KodeBookingForm.tsx` — Magic Link Self-Service

Form di LandingPage untuk jamaah request magic link sendiri. Input "Kode Booking" + input "WhatsApp" + button submit. Validasi length/format inline. Disabled state saat loading dengan spinner.

### `MagicLinkSuccessCard.tsx`

Konfirmasi setelah magic link berhasil dikirim ke WhatsApp jamaah. Card hijau dengan checkmark icon emerald + pesan "Tautan portal sudah dikirim ke WhatsApp ...".

### Magic Link Auth Flow Tokens

- **Token regex**: `/^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5}$/i` — 5 char alphanumeric, exclude 0/1/i/l/o (sulit dibaca), wajib ada huruf + digit 2-9.
- **Session cookie**: `jamaah_session` HTTP-only, expires sesuai `jamaah_portal_sessions.expires_at`.
- **Storage scope**: portal state pakai `sessionStorage` (bukan `localStorage`) karena tab-scope cocok untuk akses sementara.

### Agent-Side Magic Link Controls (`src/components/dashboard/`)

#### `MagicLinkButton.tsx`
Tombol kecil di row jamaah (di `JamaahPage` / `HajiPage`) untuk trigger modal. Saat ini gated untuk agent `nikita` selama rollout.

```
inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
bg-emerald-50 dark:bg-emerald-900/30
text-emerald-600 dark:text-emerald-400
text-[11px] font-semibold
hover:bg-emerald-100 dark:hover:bg-emerald-900/50
```

#### `MagicLinkModal.tsx`
Modal full-screen yang panggil `POST /api/portal/jamaah/:slug/magic-link/generate` lalu menampilkan link + tombol distribusi:
- WhatsApp (deep link `wa.me/<phone>?text=...` dengan pesan default)
- SMS (untuk perangkat support)
- Copy to clipboard
- Show expires_at + anggota_count (jika booking punya rombongan)

---

## Operational Controls

Kontrol ini tidak mengubah token visual, tapi mempengaruhi freshness data yang terlihat di dashboard dan Portal Jamaah:

- `DISABLE_JAMAAH_BACKGROUND_SYNC=true`: mematikan semua loop jamaah otomatis (AWAPI + legacy) tanpa mematikan notifier, cron kurs, dan public APIs.
- `DISABLE_LEGACY_BACKGROUND_SYNC=true`: mematikan fallback/enrichment legacy otomatis; jalur sync manual tetap tersedia untuk recovery tertarget.
- `SYNC_COOLDOWN_MINUTES=60`: cadence full-fleet AWAPI umroh background dalam menit. Ini berlaku per siklus semua agent AWAPI-enabled, bukan 60 menit per agent.
- `HAJI_AWAPI_SYNC_COOLDOWN_MINUTES=60`: cadence full-fleet AWAPI haji background dalam menit. First cycle haji juga ditunda sesuai cooldown agar restart tidak langsung menumpuk workload jamaah.
- Umroh tetap punya guard anti restart-storm via `data/sync-state.json`; jika siklus terakhir masih baru, first cycle ditunda sampai cooldown terpenuhi.

---

## Conventions

- **Framework**: TailwindCSS utility-first, no component library
- **Responsive**: Mobile-first (`max-w-lg` centered)
- **Border radius**: `rounded-xl` (inputs, small buttons) or `rounded-2xl` (cards)
- **Shadow**: `shadow-sm` (cards), `shadow-md shadow-{color}-500/20` (CTA), `shadow-2xl` (modals)
- **Dropdown / Select**: jangan pakai `<select>` bawaan browser untuk filter — pakai **Custom Filter Dropdown** (`FilterDropdown`, lihat sectionnya); panel **wajib beranimasi** buka/tutup (trigger + panel + animasi = satu paket).
- **Animasi**: plugin `tailwindcss-animate` **tidak terpasang** → kelas `animate-in` / `fade-in-*` / `zoom-in-*` / `slide-in-from-*` adalah **no-op** (tak menghasilkan CSS). Animasikan dengan utilitas transisi inti (`transition-all duration-150 ease-out` + `opacity`/`scale`/`translate`) atau keyframe custom di `tailwind.config.js`.
- **State management**: `useState` + `useEffect` + `useCallback` (no external library)
- **Language**: Code in English, UI text in Bahasa Indonesia
- **Pagination**: Numbered buttons `w-8 h-8 rounded-xl text-xs font-bold` with active state using primary emerald
- **Compact text**: Use `text-[9px]`–`text-[10px]` for metadata, `text-[11px]` for secondary info
- **Stat numbers**: Use `text-2xl font-bold` for headline stats
- **Currency format**: `fmtRp()` for full format, `fmtRpShort()` for compact (e.g., "Rp2.5jt", "Rp500rb")
- **Session isolation**: `clearSession()` wipes all agent-specific data (auth, CAPI sessions, UI state) on login/logout. Full page reload on navigation to prevent React state leaks between agents.
- **Auth utility**: `isSessionValid()` from `src/utils/authUtils.ts` checks token existence only (no expiry check, no cleanup)
- **Hooks rule**: All `useEffect`/`useMemo`/`useCallback` must be placed **before** conditional early returns to avoid React hooks order violations
