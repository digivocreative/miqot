# Design System — Alhijaz Dashboard

Panduan komponen, warna, layout, dan pattern yang konsisten di seluruh project.

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
bg-white dark:bg-slate-800
rounded-2xl p-3.5
border border-gray-100 dark:border-slate-700
shadow-sm
hover:shadow-lg hover:-translate-y-0.5
transition-all duration-200
active:scale-[0.97]
```

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
1. **Payment card** — progress bar + bayar/sisa amounts
2. **Info grid 2×2** — WhatsApp, Tgl Lahir, Tgl Daftar, Berangkat
3. **Perlengkapan/Dokumen** — flex-wrap badge pills (✓/✗)
4. **Action buttons** — WhatsApp + Tagih

#### Sync Indicator

```
text-[10px] text-gray-400  // "Sync: Baru saja"
text-[10px] font-semibold text-emerald-600 animate-pulse  // syncing
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

Hub page for AI tools — grid of tool cards:

```
w-full text-left bg-white dark:bg-slate-800 rounded-2xl
border border-gray-100 dark:border-slate-700 shadow-sm p-4
hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] transition-all
```

- Icon box: `w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20`
- Icon: `text-purple-600 dark:text-purple-400` (Lucide `Mic`, `Sparkles`)
- Title: `text-sm font-bold mt-3`
- Desc: `text-xs text-gray-400 mt-0.5`
- Disabled card: `opacity-50 cursor-default` (no hover effects)

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

---

## Telegram Components

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

Grouped by section (JAMAAH × 5, PAKET × 3, LAINNYA × 2):

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

Two packages: RAHMAH (5-star, $15,700) and UHUD (4-star, $12,500)

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
| `Play` / `Pause` | Audio player controls |
| `Download` | Download buttons (MP3/WAV) |
| `Package` | "Dari Paket" mode toggle |
| `PenLine` | "Tulis Manual" mode toggle |
| `Lock` / `Unlock` | PIN gate / PIN verified |
| `KeyRound` | PIN settings |
| `CheckCircle2` | Registration success |
| `Inbox` | CAPI event log empty state |
| `ArrowLeft` | Back navigation (RegisterPage) |
| `Info` | Simulasi Haji Plus info |
| `FileText` | PDF preview (Simulasi) |
| `Share2` | Share button (export/share features) |
| `Camera` | KTP upload (Pendaftaran Jamaah) |
| `Mars` / `Venus` | Visual gender indicator (Pendaftaran Jamaah) |
| `Compass` | Landing page – Haji tab indicator |
| `Plane` | Landing page – Umroh tab indicator |
| `Save` | Save button (Landing Page Settings, sticky bar) |
| `Copy` | Copy URL (Landing Page Settings) |
| `RotateCcw` | Reset to default (Landing Page Settings) |
| `XCircle` | Inline field validation error (Pendaftaran) |

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
| Disconnect modal | `dcModalIn/Out` — `scale(0.92→1)` 250ms `cubic-bezier(0.16,1,0.3,1)` |
| Chart bar transition | `transition-all duration-500` |

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
| Register form anims | `fadeSlideIn` (form entry), `errorSlideIn` (error msg) (inline `<style>`) |

---

## Image Export & Native Share

### Export Strategy
- Use `modern-screenshot` for DOM-to-PNG (specifically `domToPng` with `{ scale: 3, quality: 1 }`).
- Wait at least `1000ms` for image loading/fonts before snapshotting.
- Result should be rasterized via `fetch(dataUrl)` to `blob()` to ensure compatibility.
- **CSS Grid + Flexbox Warning**: `modern-screenshot` struggles to compute heights for flex-nested elements within grid rows, causing vertical overlapping of text/divs. When building layouts specifically for image exports, prefer using standard block-level stacking inside grid cells rather than `display: flex` and explicit alignment. Use exact sizes (`px` widths) or simpler table models to avoid clipping or wrapping issues.

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
- `modern-screenshot` may fail to accurately rasterize SVG stroke properties.
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

## Landing Page Settings (`LandingPagePage.tsx`)

Halaman pengaturan OG meta per tipe landing (Umroh / Haji) yang dipakai untuk preview link saat dishare ke WhatsApp/social.

### Type Tabs (Segmented dengan Accent Dot)

iOS-style segmented control dengan accent berbeda per type:

```
container: bg-gray-100 dark:bg-slate-800 rounded-xl p-1 flex gap-1 w-full
tab (active): flex-1 py-2 rounded-lg bg-white dark:bg-slate-700 shadow-sm font-semibold
              text-emerald-500 (umroh) / text-amber-500 (haji)
tab (inactive): bg-transparent text-gray-400 dark:text-slate-500 font-medium
```

- Icon size: `14`, strokeWidth `2.4` (active) / `2` (inactive)
- Label: `text-[13px]`
- "Has custom" indicator dot: `w-1.5 h-1.5 rounded-full bg-{accent}-500` (active) / `bg-gray-300` (inactive)

### Accent Map

| Type | Dot/Border | Hero Gradient |
|------|-----------|---------------|
| Umroh | `emerald-500` | `bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-800` |
| Haji | `amber-500` | `bg-gradient-to-br from-amber-600 via-orange-600 to-rose-700` |

### URL Bar

```
flex items-center gap-1 rounded-xl border border-gray-100 dark:border-slate-700/70
bg-gray-50/70 dark:bg-slate-900/40 pl-3 pr-1 py-1
text-[12px] font-mono text-gray-600 dark:text-slate-300
```

Trailing icon buttons (Copy, ExternalLink): `w-7 h-7 rounded-lg`

### Char Counter (Yoast-style)

| State | Color |
|-------|-------|
| Below 90% limit | `text-gray-400 dark:text-slate-500` |
| 90–100% limit | `text-amber-500 dark:text-amber-400` |
| Over limit | `text-red-500` |

Title limit: 60, Description limit: 160 (mengikuti rekomendasi Yoast).

### OG Image Upload

- Aspect ratio: `1200 / 630` (Open Graph standard)
- Reuse `PhotoCropModal` (react-easy-crop), `outputWidth=1200, outputHeight=630, quality=0.9`
- Max file: 5MB, format JPG/PNG
- Reset button: kembalikan ke default OG agent

### Sticky Save Bar

```
fixed inset-x-0 bottom-0 z-40 pointer-events-none
inner: max-w-lg mx-auto px-4 pb-4 pointer-events-auto
panel: backdrop-blur-md bg-white/80 dark:bg-slate-900/80
       border border-gray-100 dark:border-slate-700 rounded-2xl shadow-lg p-2
button: w-full py-3 rounded-xl font-bold text-sm
        bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20
disabled: bg-gray-200 dark:bg-slate-700 text-gray-400 cursor-not-allowed
```

### Toast (Inline)

```
fixed left-1/2 -translate-x-1/2 bottom-24 z-50
flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-md
text-[11.5px] font-medium max-w-[90vw] whitespace-nowrap
animate-[fadeIn_150ms_ease-out]
// success: bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 text-emerald-800
// error:   bg-red-50     dark:bg-red-900/30     border border-red-200     text-red-700
```

Auto-dismiss: 3500ms

---

## Pendaftaran Jamaah Umroh (`UmrahRegisterPage.tsx`, Admin Only)

Form multi-section yang nge-proxy langsung ke sistem PHP legacy via Express. Punya KTP OCR auto-fill dan dependent paket dropdown.

### Sectioned Form Layout

Field di-group dan di-urutkan deterministik via `FIELD_CONFIG` mapping (key = legacy HTML field name → label, section, order, required, placeholder, hidden, defaultValue):

| Section | Header Color | Contoh Field |
|---------|-------------|--------------|
| Pendaftaran | emerald | Jenis Daftar, Tgl Daftar (hidden), Tgl Berangkat |
| Data Jamaah | blue | Nama, JK, KTP, HP, Tempat/Tgl Lahir, Status Nikah, Pekerjaan, Alamat |
| Alamat | amber | Provinsi, Kab/Kota, Kecamatan, Desa/Kelurahan |
| Paket & Marketing | violet | Paket (manual pick), Marketing (auto-pick first), Koordinator (auto-pick first) |
| Pendaftar | gray | Data referrer / koordinator |
| Lainnya | gray | Field yang tidak di-config (raw name sebagai label) |

Section header style: `text-xs font-bold uppercase tracking-wide` (mengikuti pattern Settings).

### KTP Upload + Inline OCR

Inline upload area di top form:

```
border-2 border-dashed rounded-xl p-4
text-center cursor-pointer
border-gray-300 dark:border-slate-600 hover:border-emerald-400
```

- Icon: `Camera` (size 24, gray)
- File input: `accept="image/*"`, `capture="environment"` (mobile camera)
- Setelah upload → preview thumbnail + auto-trigger `POST /api/umrah/ocr-ktp`
- Loading: `Loader2` spinner + "Membaca KTP…"
- Hasil parsed (NIK, nama, tempat/tgl lahir, alamat, JK, dll) auto-fill ke field form
- Sparkles icon (`Sparkles size={14}`) di field yang berhasil di-auto-fill (visual indicator)

### Searchable Select (Tgl Berangkat)

Untuk select dengan banyak opsi (jadwal keberangkatan), pakai pattern combobox:

```
button trigger: w-full px-3 py-2.5 rounded-xl border bg-white dark:bg-slate-900 text-left flex items-center justify-between
dropdown: absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto
          rounded-xl border bg-white dark:bg-slate-800 shadow-lg z-20
search input: sticky top-0 bg-white dark:bg-slate-800 px-3 py-2 border-b
              w-full bg-gray-50 dark:bg-slate-900 rounded-lg px-2 py-1 text-sm
option: w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-700/50
selected option: bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600
```

Search filter: case-insensitive substring di label.

### Dependent Loading State

Saat pilih jadwal → fetch dependent options via `_otb.php`:
- Loader: small inline `Loader2` di samping label "Memuat paket…"
- Warna emerald (consistent dengan primary)

### Submit & Success

- Submit button: standard primary CTA emerald (lihat Buttons section)
- Success state: full-screen inline card dengan `CheckCircle2` size 28, color `#10b981`, "Pendaftaran berhasil!" + tombol "Daftarkan Lagi" (reset form)

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

Date display: full Indonesian format (e.g., "Kamis, 2 April 2026")

---

## Conventions

- **Framework**: TailwindCSS utility-first, no component library
- **Responsive**: Mobile-first (`max-w-lg` centered)
- **Border radius**: `rounded-xl` (inputs, small buttons) or `rounded-2xl` (cards)
- **Shadow**: `shadow-sm` (cards), `shadow-md shadow-{color}-500/20` (CTA), `shadow-2xl` (modals)
- **State management**: `useState` + `useEffect` + `useCallback` (no external library)
- **Language**: Code in English, UI text in Bahasa Indonesia
- **Pagination**: Numbered buttons `w-8 h-8 rounded-xl text-xs font-bold` with active state using primary emerald
- **Compact text**: Use `text-[9px]`–`text-[10px]` for metadata, `text-[11px]` for secondary info
- **Stat numbers**: Use `text-2xl font-bold` for headline stats
- **Currency format**: `fmtRp()` for full format, `fmtRpShort()` for compact (e.g., "Rp2.5jt", "Rp500rb")
- **Session isolation**: `clearSession()` wipes all agent-specific data (auth, CAPI sessions, UI state) on login/logout. Full page reload on navigation to prevent React state leaks between agents.
- **Auth utility**: `isSessionValid()` from `src/utils/authUtils.ts` checks token existence only (no expiry check, no cleanup)
- **Hooks rule**: All `useEffect`/`useMemo`/`useCallback` must be placed **before** conditional early returns to avoid React hooks order violations
