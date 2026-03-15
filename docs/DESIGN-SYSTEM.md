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
| **Success** | `emerald-50` bg, `emerald-500` text | `emerald-900/20`, `emerald-300` | Session bars, status |
| **Error** | `red-50` bg, `red-600` text | `red-900/20`, `red-400` | Error messages, disconnect |
| **Warning/Accent** | `amber-50` bg, `amber-600` text | `amber-900/20`, `amber-400` | Jamaah, admin badge |
| **Info** | `blue-50` bg, `blue-600` text | `blue-900/20`, `blue-400` | Kalkulasi, profile |
| **Neutral** | `gray-50`–`gray-600` | `slate-400`–`slate-700` | Borders, secondary text |

### Feature Card Colors (Dashboard Menu)

| Feature | Icon Color | Background |
|---------|-----------|------------|
| Kalkulasi | `blue-600` / `blue-400` | `blue-50` / `blue-900/20` |
| Compare | `violet-600` / `violet-400` | `violet-50` / `violet-900/20` |
| Meta CAPI | `gray-600` / `gray-400` | `gray-50` / `gray-800/30` |
| Agents | `cyan-600` / `cyan-400` | `cyan-50` / `cyan-900/20` |
| Jamaah | `amber-600` / `amber-400` | `amber-50` / `amber-900/20` |

### Jamaah Page Colors

| Context | Light | Dark |
|---------|-------|------|
| Lunas badge | `emerald-600` text | `emerald-400` text |
| Belum lunas (sisa) | `amber-600` text | `amber-400` text |
| Departure ≤10 days | `red-50` bg, `red-600` text | `red-900/20`, `red-400` |
| Departure ≤30 days | `amber-50` bg, `amber-600` text | `amber-900/20`, `amber-400` |
| Gender ring (P) | `ring-2 ring-pink-300` | same |
| Gender ring (L) | `ring-2 ring-blue-300` | same |

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
- **Card spacing**: `space-y-4` atau `mb-5`

### Header (Sticky)

```
sticky top-0 z-30 backdrop-blur-md
bg-white/90 dark:bg-slate-900/90
border-b border-gray-100 dark:border-slate-700/50
```

- Inner: `max-w-lg mx-auto px-4 py-3 flex items-center`
- Back button: `w-9 h-9 rounded-xl bg-gray-100/80`

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
| `ChevronLeft` / `ChevronRight` | Navigation |
| `Search` | Filter submit |
| `Calendar` | Date-related |
| `User` / `Users` | Profile / Agent |
| `Settings` | Config / CAPI |
| `Calculator` | Kalkulasi |
| `ArrowLeftRight` | Compare |
| `Building2` | Kantor |
| `Moon` / `Sun` | Dark mode toggle |
| `Shield` | Admin badge |

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
| Page transition | Curtain overlay (see `index.css`) |

---

## Custom CSS (index.css)

| Feature | Class / Selector |
|---------|-------------------|
| Line clamp | `.line-clamp-1`, `.line-clamp-2` |
| Hide scrollbar | `.no-scrollbar` |
| AI button glow | `.ai-border-glow` (conic gradient, rotating) |
| Page transition overlay | `.page-transition-overlay` |
| Legacy table styling | `.laporan-content table/th/td` |

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
