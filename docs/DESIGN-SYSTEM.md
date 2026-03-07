# Design System — Alhijaz Indowisata

Referensi desain yang digunakan di seluruh project. Gunakan file ini sebagai acuan agar output desain konsisten.

---

## Font

| Properti | Nilai |
|---|---|
| **Family** | `Inter` (Google Fonts), fallback: `system-ui`, `sans-serif` |
| **Weights** | `400` (normal), `500` (medium), `600` (semibold), `700` (bold) |
| **Import** | `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700` |

---

## Palet Warna

### Brand / Primary (Emerald)

| Token | Hex | Tailwind Class | Penggunaan |
|---|---|---|---|
| Primary 50 | `#ecfdf5` | `bg-emerald-50` | Background ringan, hover state |
| Primary 100 | `#d1fae5` | `bg-emerald-100` | Badge, border |
| Primary 500 | `#10b981` | `bg-emerald-500` | Tombol utama, aksen |
| Primary 600 | `#059669` | `bg-emerald-600` | Tombol hover, teks jarak hotel |
| Primary 700 | `#047857` | `text-emerald-700` | Harga |

### Neutral (Gray — Light Mode)

| Token | Hex | Penggunaan |
|---|---|---|
| `gray-50` | `#f9fafb` | Background halaman |
| `gray-100` | `#f3f4f6` | Background card section, border |
| `gray-400` | `#9ca3af` | Secondary text |
| `gray-500` | `#6b7280` | Icon, placeholder |
| `gray-700` | `#374151` | Body text |
| `gray-800` | `#1f2937` | Heading |
| `gray-900` | `#111827` | Strong heading |

### Dark Mode (Slate)

| Token | Hex | Penggunaan |
|---|---|---|
| `slate-700` | `#334155` | Border |
| `slate-800` | `#1e293b` | Card background |
| `slate-900` | `#0f172a` | Page background, input |
| `slate-950` | `#020617` | Gradient end |

### Semantik

| Peran | Light | Dark | Penggunaan |
|---|---|---|---|
| **Success** | `emerald-500` | `emerald-400` | Seat tersedia, badge sukses |
| **Warning** | `amber-500` | `amber-400` | Seat menipis, promo badge |
| **Danger** | `red-500` | `red-400` | Seat habis, error state |
| **Info** | `blue-500` | `blue-400` | Link, info badge |
| **AI/Special** | `indigo-500` / `violet-500` | `indigo-400` | AI copywriting button |

---

## Dark Mode

| Aspek | Konvensi |
|---|---|
| Aktivasi | `class` strategy (`darkMode: 'class'` di Tailwind) |
| Toggle | Disimpan di `localStorage('darkMode')` |
| Background halaman | `bg-gradient-to-b from-gray-50 to-gray-100` → `dark:from-slate-900 dark:to-slate-950` |
| Card background | `bg-white` → `dark:bg-slate-800` |
| Border | `border-gray-100` → `dark:border-slate-700` |
| Text utama | `text-gray-800` → `dark:text-white` |
| Text sekunder | `text-gray-500` → `dark:text-slate-400` |

---

## Border Radius

| Radius | Class | Penggunaan |
|---|---|---|
| Small | `rounded-lg` | Input, badge kecil |
| Medium | `rounded-xl` | Card section, button besar, input section |
| Large | `rounded-2xl` | Card utama, modal |
| Full | `rounded-full` | Avatar, pill button, progress bar, icon button |

---

## Shadow

| Level | Class | Penggunaan |
|---|---|---|
| Subtle | `shadow-sm` | Card section |
| Normal | `shadow-md` | Button CTA |
| Elevated | `shadow-lg` | Floating bar |
| Modal | `shadow-2xl` | Modal, overlay card |
| Colored | `shadow-emerald-500/20` | CTA button glow |

---

## Spacing & Layout

| Aspek | Nilai |
|---|---|
| Max width konten | `max-w-lg` (32rem / 512px) |
| Padding halaman | `px-4` |
| Padding card | `p-3` - `p-4` |
| Gap antar card | `space-y-3` (normal), `space-y-1.5` (compact) |
| Gap antar elemen | `gap-1` - `gap-3` |

---

## Komponen UI

### 1. Card (PackageCard)
```
bg-white dark:bg-slate-800 rounded-xl shadow-sm
border border-gray-100 dark:border-slate-700/50
overflow-hidden cursor-pointer
transition-all duration-300
```

### 2. Card Section (di dalam card)
```
bg-gray-50 dark:bg-slate-900/50 rounded-xl
border border-gray-100 dark:border-slate-700
p-3
```

### 3. Button — Primary (CTA)
```
bg-emerald-500 hover:bg-emerald-600
text-white text-sm font-bold
px-5 py-2.5 rounded-xl
shadow-md shadow-emerald-500/20
active:scale-95 transition-all
```

### 4. Button — WhatsApp Chat (rounded pill)
```
bg-emerald-500 hover:bg-emerald-600
text-white text-xs font-bold tracking-wide
pl-3 pr-4 py-2 rounded-full
shadow-lg shadow-emerald-500/20
active:scale-[0.96] transition-all
```

### 5. Button — Ghost / Icon
```
p-2 bg-gray-100 dark:bg-slate-800
rounded-full text-gray-600 dark:text-slate-300
hover:bg-gray-200 dark:hover:bg-slate-700
transition-colors
```

### 6. Button — Danger
```
bg-red-600 hover:bg-red-700 text-white
rounded-xl font-bold
active:scale-95 transition-all
```

### 7. Modal Backdrop
```
fixed inset-0 z-50
bg-black/60 backdrop-blur-sm
```

### 8. Modal Container
```
bg-white dark:bg-slate-800 rounded-2xl
shadow-2xl max-w-md w-full
max-h-[80vh] overflow-hidden
```

### 9. Input Field
```
w-full px-3 py-2.5
bg-white dark:bg-slate-900
border border-gray-200 dark:border-slate-700
rounded-lg text-sm
focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
outline-none transition-all
```

### 10. Badge — Promo
```
bg-amber-100 dark:bg-amber-900/30
text-amber-700 dark:text-amber-300
text-xs font-bold px-2 py-0.5 rounded-full
```

### 11. Badge — Seat Status
```
// Banyak seat (>10)
bg-emerald-100 text-emerald-700

// Sedikit seat (≤10)
bg-amber-100 text-amber-700

// Habis
bg-red-100 text-red-700
```

### 12. Floating Bar (FloatingAgentBar)
```
fixed bottom-6 left-4 right-4 z-50 rounded-full
bg-gradient-to-r from-emerald-50 via-white to-white
dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800
backdrop-blur-md shadow-2xl
border border-emerald-100 dark:border-emerald-800/50
```

### 13. Agent Profile Card
```
p-3 rounded-xl
bg-gradient-to-r from-emerald-50 via-white to-white
dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800
border border-emerald-100 dark:border-emerald-800/50
shadow-sm
```

### 14. Avatar
```
w-11 h-11 rounded-full object-cover
border-2 border-white dark:border-slate-700
shadow-md
```

### 15. Sticky Header
```
sticky top-0 z-30
backdrop-blur-md bg-white/90 dark:bg-slate-900/90
border-b border-gray-100 dark:border-slate-700/50
```

### 16. Empty State
```
text-center py-16
// Icon container
w-20 h-20 mx-auto mb-5 bg-gray-100 dark:bg-slate-800 rounded-full
// Title
text-gray-700 dark:text-white font-semibold text-lg mb-1
// Subtitle
text-gray-400 text-sm mb-6
```

---

## Teks Ukuran

| Ukuran | Class | Penggunaan |
|---|---|---|
| 10px | `text-[10px]` | Label kecil, keterangan minor |
| 11px | `text-[11px]` | Website agent, subtitle |
| 12px | `text-xs` | Badge, caption, meta info |
| 13px | `text-[13px]` | Nama agent di card |
| 14px | `text-sm` | Body text, button text, input |
| 16px | `text-base` | Heading card |
| 18px | `text-lg` | Empty state heading |

---

## Animasi & Transisi

| Nama | Durasi | Easing | Penggunaan |
|---|---|---|---|
| **Default transition** | `duration-300` | default | Hover, color change |
| **Active press** | instant | — | `active:scale-95` atau `active:scale-[0.96]` |
| **Shimmer** | `1.5s` | linear, infinite | Loading skeleton, progress bar |
| **Slide up** | `0.3s` | `cubic-bezier(0.16, 1, 0.3, 1)` | Modal masuk |
| **Curtain** | `0.28s` in, `0.4s` out | ease | Page transition |
| **Content reveal** | `0.45s` | `cubic-bezier(0.22, 1, 0.36, 1)` | Page entering |
| **Framer Motion** | varies | spring/tween | FilterModal, komponen animasi |

### AI Button Glow
```css
.ai-border-glow {
  background: conic-gradient(from var(--ai-angle), #818cf8, #6366f1, #7c3aed, #a78bfa, #c7d2fe, #818cf8);
  animation: ai-rotate 2.5s linear infinite;
  box-shadow: 0 0 8px rgba(129, 140, 248, 0.4), 0 0 20px rgba(139, 92, 246, 0.15);
}
```

---

## Icon Library

| Library | Penggunaan |
|---|---|
| **Lucide React** | Icon utama (Filter, Search, Settings, dll.) |
| **Inline SVG** | WhatsApp logo, verified badge, custom icon |

---

## Responsive

| Aspek | Pendekatan |
|---|---|
| **Strategy** | Mobile-first (max-w-lg centered) |
| **Target** | Optimized untuk layar HP (< 512px) |
| **No breakpoint** | Tidak menggunakan `sm:`, `md:`, `lg:` — layout single column |

---

## PWA

| Aspek | Nilai |
|---|---|
| Theme color | `#001427` |
| Status bar style | `black-translucent` |
| Service Worker | `vite-plugin-pwa` (Workbox, generateSW) |
| Offline | ✅ Precached |
