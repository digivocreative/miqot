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

| Context | Light | Dark |
|---------|-------|------|
| Lunas badge | `emerald-600` text | `emerald-400` text |
| Belum lunas (sisa) | `amber-600` text | `amber-400` text |
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

### Leads Page Colors

| Context | Light | Dark |
|---------|-------|------|
| Status ring (Baru) | `ring-2 ring-blue-300` | same |
| Status ring (Dihubungi) | `ring-2 ring-amber-300` | same |
| Status ring (Closing) | `ring-2 ring-emerald-300` | same |
| Status ring (Tidak Berminat) | `ring-2 ring-gray-300` | same |
| Badge (Baru) | `bg-blue-50 text-blue-600` | `bg-blue-900/20 text-blue-400` |
| Badge (Dihubungi) | `bg-amber-50 text-amber-600` | `bg-amber-900/20 text-amber-400` |
| Badge (Closing) | `bg-emerald-50 text-emerald-600` | `bg-emerald-900/20 text-emerald-400` |
| Badge (Tidak Berminat) | `bg-gray-100 text-gray-500` | `bg-slate-700 text-slate-400` |
| Expanded card border | `border-blue-200` | `border-blue-800/50` |

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

Layout: Avatar (w-10 h-10, gender ring, lunas checkmark overlay) → Info (nama + paket) → Status (lunas/sisa + departure badge) → Chevron

#### Avatar with Gender Ring + Lunas Overlay

```html
<div className="relative">
  <div className="w-10 h-10 rounded-full ... ring-2 ring-pink-300"> <!-- or ring-blue-300 -->
    {initials}
  </div>
  <!-- Lunas overlay -->
  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white">
    <Check size={9} strokeWidth={3} />
  </div>
</div>
```

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

### Leads Page Components

#### Stat Cards (4-column grid)

```
grid grid-cols-4 gap-2.5
card: bg-white dark:bg-slate-800 rounded-2xl border shadow-sm p-3 text-center
      active:scale-95 transition-all cursor-pointer
active card: border-emerald-500 dark:border-emerald-600 ring-2 ring-emerald-100 dark:ring-emerald-900/30
```

Inner: icon box `w-8 h-8 mx-auto rounded-xl` → value `text-2xl font-bold` → label `text-[9px] uppercase`

| Status | Icon | Icon Color | Background |
|--------|------|-----------|------------|
| Semua | `User` | `emerald-600` / `emerald-400` | `emerald-50` / `emerald-900/20` |
| Baru | `Clock` | `blue-600` / `blue-400` | `blue-50` / `blue-900/20` |
| Proses | `MessageSquare` | `amber-600` / `amber-400` | `amber-50` / `amber-900/20` |
| Closing | `CheckCircle` | `emerald-600` / `emerald-400` | `emerald-50` / `emerald-900/20` |

#### Lead Card (Collapsed)

```
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700
shadow-sm overflow-hidden active:bg-gray-50 dark:active:bg-slate-700/50 transition-colors
```

Expanded card adds: `border-blue-200 dark:border-blue-800/50 shadow-md shadow-blue-500/5`

Layout: Avatar (w-10 h-10, status ring) → Info (nama + budget + departure) → Status badge → Chevron

#### Avatar with Status Ring

```html
<div className="w-10 h-10 rounded-full ... ring-2 ring-{status-color}">
  {initials}
</div>
```

| Status | Ring Color |
|--------|-----------|
| Baru | `ring-blue-300` |
| Dihubungi | `ring-amber-300` |
| Closing | `ring-emerald-300` |
| Tidak Berminat | `ring-gray-300` |

#### Status Badge

```
text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md
baru: bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400
dihubungi: bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400
closing: bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400
tidak_berminat: bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400
```

#### Chevron Rotation (Expand/Collapse)

```tsx
<motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
  <ChevronDown size={16} strokeWidth={2} className="text-gray-300 dark:text-slate-600" />
</motion.div>
```

#### Expanded Detail (Lead)

```
px-3 pb-3 pt-2 border-t border-gray-50 dark:border-slate-700/50 space-y-3
```

Animation: `AnimatePresence` + `motion.div` with `initial={{ height: 0, opacity: 0 }}` `animate={{ height: 'auto', opacity: 1 }}` duration 0.2s

#### Skeleton Loading

Shown while `loading === true` (initial fetch only, not on search/filter):

```
Stat cards: grid-cols-4, each h-20 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse
Search bar: h-12 rounded-2xl animate-pulse
Lead cards: 3× h-20 rounded-2xl animate-pulse
```

#### Empty States

```
bg-white dark:bg-slate-800 rounded-2xl border shadow-sm p-8 text-center
Icon: w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-slate-700
Text: text-sm font-medium text-gray-500 dark:text-slate-400
Sub: text-xs text-gray-400 dark:text-slate-500
```

| State | Icon | Title |
|-------|------|-------|
| No leads | `UserPlus` | "Belum ada lead" |
| No search results | `Search` | "Tidak ditemukan" |

#### Sync Indicator (Leads)

```
text-[10px] text-gray-400 dark:text-slate-500 text-center mt-1.5
// "{n} lead · Terakhir diperbarui: baru saja"
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

---

## Image Export & Native Share

### Export Strategy
- Use `modern-screenshot` for DOM-to-PNG (specifically `domToPng` with `{ scale: 3, quality: 1 }`).
- Wait at least `1000ms` for image loading/fonts before snapshotting.
- Result should be rasterized via `fetch(dataUrl)` to `blob()` to ensure compatibility.

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
