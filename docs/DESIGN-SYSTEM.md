# Design System - Alhijaz Dashboard

Terakhir diperbarui: 2026-07-12

Dokumen ini merangkum aturan visual dan interaction pattern yang aktif di repo `miqot`. Sumber audit: `tailwind.config.js`, `src/index.css`, `src/components/common/SegmentedControl.tsx`, `FilterDropdown.tsx`, dashboard pages, Portal Jamaah, dan komponen export/share.

## Prinsip Produk

- **Mobile-first operations UI**: dashboard dipakai berulang oleh agent, jadi prioritaskan scanning cepat, touch target jelas, dan kepadatan informasi yang masih rapi.
- **Premium, tapi utilitarian**: warna utama emerald/teal, netral slate/gray, aksen secukupnya per fitur. Hindari tampilan marketing hero di dashboard.
- **Card-based mobile shell**: app utama memakai `max-w-lg` centered, cards `rounded-2xl`, border halus, shadow kecil.
- **Dark mode first-class**: setiap surface baru harus punya pasangan `dark:` yang setara.
- **Icons for actions**: gunakan Lucide React untuk tombol/action. Custom SVG hanya untuk brand icon seperti WhatsApp/Telegram.
- **No surprise layout shift**: fixed-format controls seperti toolbar, icon button, filter pill, tab, card row, dan export canvas harus punya dimensi stabil.

## Token Dasar

### Typography

| Role | Class / value |
| --- | --- |
| Body | `Inter`, system-ui, `text-sm`, `font-normal` |
| Page title | `text-sm font-bold` |
| Section header | `text-xs font-bold uppercase tracking-wide` |
| Label | `text-xs font-semibold uppercase tracking-wide` |
| Body text | `text-sm` |
| Supporting text | `text-[10px]` to `text-[12px]`, `font-medium` |
| Badge | `text-[9px] font-bold uppercase tracking-wide` |
| Stat value | `text-2xl font-bold` |

Do not scale font size with viewport width. Keep letter spacing at default except existing uppercase micro-labels that use Tailwind `tracking-wide`.

### Colors

| Role | Light | Dark | Usage |
| --- | --- | --- | --- |
| Page | `from-gray-50 to-gray-100` | `from-slate-900 to-slate-950` | Main app shell |
| Card | `bg-white` | `bg-slate-800` | Dashboard cards |
| Card border | `border-gray-100` | `border-slate-700` | Default card border |
| Input | `bg-white border-gray-200` | `bg-slate-900 border-slate-700` | Forms |
| Header | `bg-white/90 backdrop-blur-md` | `bg-slate-900/90` | Sticky dashboard header |
| Primary | `emerald-500/600` | `emerald-400` | CTA, focus, success |
| Info | `blue-50/600` | `blue-900/20`, `blue-400` | Flight, DP, information |
| Warning | `amber-50/600` | `amber-900/20`, `amber-400` | Belum bayar, alerts |
| Error | `red-50/600` | `red-900/20`, `red-400` | Errors, destructive |
| Violet | `violet-50/600` | `violet-900/20`, `violet-400` | Compare, docs, special tools |
| Rose/Pink | `rose/pink` | `rose/pink dark variants` | Brosur, birthday, female ring |
| Neutral | `gray-*` | `slate-*` | Text, borders, secondary UI |

Feature accents:

| Feature | Accent |
| --- | --- |
| Jadwal / Statistik | Emerald / green |
| Jamaah | Amber |
| Kalkulasi | Blue |
| Compare | Violet |
| Brosur | Rose |
| AI Tools | Purple/fuchsia |
| Agents / Analytics | Cyan |
| Flight status | Blue untuk scheduled/en-route, red untuk delayed/cancelled, emerald untuk landed |
| Flight OG | Burgundy/gold Alhijaz dengan panel itinerary putih |
| Settings / CAPI neutral | Gray/slate |
| Telegram | `#2AA9E0`, `#229ED9`, `#16719E` |

Avoid one-note palettes. Do not make a whole screen dominated by only purple, beige, dark blue, or brown/orange unless matching an existing specialized template.

## Layout Shell

Default dashboard/public app shell:

```tsx
<div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950">
  <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/90" />
  <main className="mx-auto max-w-lg px-4 pt-4 pb-8" />
</div>
```

Rules:

- Main content width: `max-w-lg` for dashboard and mobile-first public app.
- Horizontal padding: `px-4`.
- Page bottom padding: `pb-8` minimum.
- Compact list spacing: `space-y-1.5`.
- Standard card spacing: `space-y-3` or `space-y-4`.
- Fullscreen modals use `z-50` or higher; Ask AI uses `z-[9999]`.
- Do not nest cards inside cards unless it is a real repeated item, modal body, or framed tool.

## Cards

### Standard Card

```tsx
<div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
  ...
</div>
```

### Card With Header

```tsx
<div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
  <div className="border-b border-gray-50 px-4 py-2.5 dark:border-slate-700/50">
    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">Title</h3>
  </div>
  <div className="p-4">...</div>
</div>
```

### Stat Card

```tsx
<div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg ..." />
  <p className="text-2xl font-bold text-gray-900 dark:text-white">...</p>
  <p className="text-[10px] font-medium text-gray-400 dark:text-slate-500">...</p>
</div>
```

Do not introduce large floating section cards around whole pages. Use full-width page sections or the normal constrained shell.

## Buttons

### Primary CTA

```tsx
<button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70">
  ...
</button>
```

### Icon Button

```tsx
<button className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700">
  <Icon size={16} />
</button>
```

### Secondary / Danger Text Button

```tsx
<button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
  ...
</button>
```

### Dashboard Menu Cards

Home menu cards are compact 3-column buttons configured in `DashboardLayout.tsx`.

Pattern:

- `grid grid-cols-3 gap-3`
- Card: feature-tinted gradient, `rounded-2xl p-3.5 border shadow-sm`
- Icon shell: `w-11 h-11 rounded-xl`, feature gradient, white icon
- Label: `text-[12px] font-bold`
- Existing ambient overlay/blur is allowed only inside these menu cards. Do not add new free-floating decorative blobs elsewhere.

## Segmented Control

Canonical component: `src/components/common/SegmentedControl.tsx`.

Use for mode switches/tabs with 2-4 options.

```tsx
<SegmentedControl
  options={options}
  value={value}
  onChange={setValue}
  accent="emerald"
/>
```

Track:

```text
flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full
```

Active item:

```text
bg-white dark:bg-slate-700 shadow-sm font-semibold text-emerald-500 dark:text-emerald-400
```

Inactive:

```text
bg-transparent text-gray-400 dark:text-slate-500 font-semibold active:opacity-70
```

Available accents: `emerald`, `amber`, `teal`, `violet`.

## Forms

### Text Input / Select Base

Current shared class from `UmrahRegisterPage.tsx`:

```text
w-full px-3 py-2.5 bg-white dark:bg-slate-900
border border-gray-200 dark:border-slate-700
rounded-xl text-sm
focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
outline-none transition-all
text-gray-800 dark:text-white placeholder:text-gray-400
disabled:opacity-50
```

Error state:

```text
border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500
```

Label:

```text
flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wide
```

Rules:

- Do not use native `<select>` for dashboard filter/dropdown work unless the existing component cannot fit the use case.
- Required fields use a red `*`.
- Hidden legacy fields must not appear as fake user-editable controls.
- Buttons in forms should include icon + text only for clear commands; otherwise icon-only with `title`/aria-label.

## Custom Dropdown

Canonical component: `src/components/FilterDropdown.tsx`.

Use it for dashboard filters and compact select-like controls.

Props:

- `variant="mini"`: `h-7`, tight header/filter pills.
- `variant="compact"`: `h-9`, filter rows and toolbars.
- `variant="default"`: `py-2.5`, form/page controls.
- `portal`: render panel in `document.body` for overflow-hidden parents.
- `accent`: emerald trigger skin.
- `showAllOptions`: no max-height cap.

Behavior:

- Panel is always mounted so open and close both animate.
- Search appears when option count is >= 8.
- Escape and outside click close the panel.
- Portaled panel follows trigger on scroll/resize.
- Touch scrolling is contained to prevent mobile sheet/page scroll bleed.

Panel skin:

```text
rounded-xl border border-gray-100 dark:border-slate-700
bg-white dark:bg-slate-800 shadow-lg
transition duration-150 ease-out
```

Selected row uses emerald text/checkmark.

## Jamaah UI

### Payment Status

| Status | Condition | Visual |
| --- | --- | --- |
| Belum Bayar | `bayar === 0` | Amber amount, avatar `?`, card tint `bg-amber-50/60` |
| Sudah DP | `bayar > 0 && sisa > 0` | Blue amount, avatar clock |
| Lunas | `sisa <= 0` | Emerald amount/check, "Lunas" |

Payment progress must clamp to `0..100` and treat negative `sisa` as overpayment, not broken progress.

### Jamaah Card

Collapsed card:

```text
bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden
```

Layout:

1. Avatar `w-10 h-10`.
2. Name and package.
3. Payment/departure status.
4. Chevron.

Gender rings:

- Female: `ring-2 ring-pink-300`
- Male: `ring-2 ring-blue-300`

Expanded detail sections:

- Payment summary card.
- Info grid.
- Surat Pernyataan action.
- Perlengkapan/dokumen pills.
- WhatsApp/tagih/action buttons.
- Notes editor.

### Advanced Filter Panel

Used in Umroh and Haji pages.

Animation:

```ts
initial={{ height: 0, opacity: 0 }}
animate={{ height: 'auto', opacity: 1 }}
exit={{ height: 0, opacity: 0 }}
transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
```

Group labels:

```text
text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500
```

Filter pills:

- Active: `bg-emerald-500 text-white shadow-md shadow-emerald-500/20`
- Inactive: `bg-gray-50 dark:bg-slate-900 text-gray-500 border border-gray-200`

## Haji UI

- Haji payment amounts are USD, formatted like `USD 1.234`.
- Collapsed card uses the same avatar/gender/lunas pattern as Jamaah Umroh.
- Tahun masehi badge: `text-orange-600 dark:text-orange-400 font-bold`.
- BPIH button: blue soft.
- Pernyataan button: violet soft.
- WhatsApp action: emerald filled.

## Umrah Self-Registration

File: `src/components/UmrahRegisterPage.tsx`.

Section order:

1. `Info Pendaftaran`
2. `Data Jamaah`
3. `Alamat`
4. `Diskon`
5. `Info Pendaftar`
6. `Info Otomatis`
7. `Lainnya`

Current UI specifics:

- Field config maps legacy names to labels and sections.
- `status`, `nikah`, and `status_nikah` display as **Status Nikah**.
- Locked fields: Jenis Daftar, Marketing, Koordinator.
- Hidden fields auto-submit with default values such as `mahram=X`, `kondisi=X`, `keterangan=X`.
- KTP OCR has processing state with scan animation.
- Name pendaftar input uppercases.
- Searchable selects are used for long option lists.
- Disc. Marketing is optional, displays a dot-formatted Rupiah amount, keeps raw digits for submission, and offers Rp 300.000, Rp 500.000, and Rp 1.000.000 quick actions.
- In add-jamaah mode, top blue info box shows group/id context.
- Submit responses are read as text, then JSON-parsed if possible. HTML/Cloudflare body is summarized for users.

Add-jamaah route context:

- URL: `/dashboard/jamaah/daftar?idb=<id_umroh.id_jadwal>`
- The visible ID may look like `AIW0029560.JBU1535`; keep the full value in the UI.

## Ask AI / Diskusi

Entry button:

```text
diskusi-ai-border flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 border-transparent
```

`diskusi-ai-border` is defined in `src/index.css` with a 2px animated emerald conic ring.

Modal:

- Fullscreen bottom sheet.
- `z-[9999]`.
- Uses `visualViewport` for iOS keyboard handling.
- Header: back button, `AiAvatar`, title, subtitle, info button.
- Chat bubbles use `text-[13px]`, rounded `2xl`, and emerald user bubble.
- Preset chips stack vertically; follow-up pills wrap.
- WA nudge card appears after repeated AI answers/fallback.
- Attachment cards for brochure and itinerary use constrained max width.

Do not add visible tutorial text inside the modal. Use direct controls and familiar labels.

## AI Tools / Export Surfaces

### Brosur Jadwal

- Page shell stays dashboard-like.
- Export template is fixed-format and can use stronger visual design than dashboard cards.
- Maintain stable canvas dimensions and font loading before capture.
- Split long monthly catalog output instead of shrinking text until unreadable.

### Kurs Share

- `ShareKursModal` previews fixed 16:10 JPG canvas.
- Template is `1400x1000`.
- Use server/cache helpers for generated images when available.

### Business Card / Birthday / Haji Plus Export

- Treat output as a canvas/poster, not as normal responsive UI.
- Define exact width/height or aspect ratio.
- Check text overflow before adding new dynamic fields.
- Native share should use file payload on mobile where supported.

## Portal Jamaah

Folder: `src/components/portal-jamaah/`.

Portal has a related but slightly more polished/glass style than agent dashboard.

### Headers

`PortalTopBar.tsx`:

```text
sticky top-0 z-30
border-b border-white/60 dark:border-white/10
bg-white/70 dark:bg-slate-950/70
shadow-sm backdrop-blur-xl backdrop-saturate-150
```

`PortalBackBar.tsx` follows the same glass pattern.

### Menu Cards

`PortalMenuGrid` uses compact cards with icon accent per menu from `portalMenu.ts`.

Card rules:

- Keep touch target comfortable.
- Use menu-specific accent, but keep neutral body text.
- Do not add marketing copy; tiles should be task-oriented.

### Alerts and Tasks

- `SmartAlertsStrip` uses tone-aware colors: red, amber, violet, purple, emerald.
- `TaskListWidget` should surface urgent work without verbose instructions.
- `StickyWhatsAppCta` is a footer pill that appears/disappears based on scroll direction.

## Public Package Cards

`PackageCard.tsx` is large and has several variants. When changing it:

- Preserve all card variants unless intentionally removing one.
- Keep price ladder and hotel block tied to the active tier.
- Use flag overlays from `public/flags/`.
- Keep action row geometry consistent across Brosur, Simpan, Diskusi, and related actions.
- Single package view can use full-width primary action variants.

## Icons

Default library: `lucide-react`.

Common sizes:

| Context | Size |
| --- | --- |
| Micro label | 10-12 |
| Inline text | 13-14 |
| Card/action button | 16 |
| Main menu icon | 20-24 |
| Empty state | 32-44 |

Use `strokeWidth={2.2}` to `2.5` for compact buttons where the default looks too thin.

Custom SVG allowed for:

- WhatsApp icon.
- Telegram icon.
- Brand/asset-specific marks.

## Loading, Empty, Error

### Loading

- Button loading: Lucide `Loader2` with `animate-spin`.
- Page/card skeletons: neutral gray/slate blocks with pulse/shimmer.
- Long operations should preserve layout dimensions.

### Errors

Inline form error:

```text
mt-1 text-xs text-red-500 dark:text-red-400
```

Block error:

```text
p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium
```

Legacy/proxy HTML errors must be summarized in user language; never render raw `<!DOCTYPE html>` into the UI.

## Animations

Tailwind animations from `tailwind.config.js`:

- `barPulse`
- `slideUp`
- `ktpScan`
- `ktpGlow`
- `shimmer`
- `paketFloat`
- icon animations: float, breathe, sway, wiggle, twinkle, spin-slow, rise

Custom CSS in `src/index.css`:

- page transition curtain
- content reveal
- laporan legacy table styles
- disconnect modal animations
- stripe progress animation
- birthday pulse
- AI conic border ring

Rules:

- Use animation to show state, not as decoration.
- Keep durations around `150-300ms` for controls and `280-450ms` for page/modal transitions.
- Use Framer Motion where already established for sheets/panels.

Flight route animation:

- Gunakan `src/components/FlightRouteLine.tsx` untuk kartu Dashboard dan landing `/f/:code`; jangan membuat SVG atau perhitungan progress terpisah.
- `scheduled`: blue marching dashes untuk perjalanan yang belum dimulai.
- `en-route`: bagian yang sudah ditempuh berwarna biru, aurora bergerak, serta plane marker yang pulse pada progress terkini.
- `delayed`: red marching dashes; `landed`: garis emerald dan check pop; `cancelled`: garis dashed statis.
- Warna, label, dan normalisasi status berasal dari `src/lib/flightStatusPresentation.ts` agar state visual selalu konsisten di semua surface.

## Image Export & Native Share

Export strategy:

- `snapdom` for DOM-to-image cards that need fidelity.
- `modern-screenshot` for brochure/page captures already using it.
- `sharp`/server helper for generated OG and some cached images.

Flight social preview:

- `/og/flight/:code.png` selalu menghasilkan PNG `1200x630` melalui `lib/og-generator.mjs`.
- Gunakan identitas Alhijaz burgundy/gold, tampilkan agent, maskapai/nomor penerbangan, tanggal, route, jam, durasi, group/pax, dan TL dengan hierarchy yang tetap terbaca pada thumbnail kecil.
- Jangan menaruh status operasional yang cepat berubah pada gambar karena cache crawler dapat bertahan lebih lama daripada data live.
- Meta `/f/:code` harus menunjuk URL gambar versioned dan menyertakan width, height, MIME type, alt text, canonical, serta Twitter large image card.

Native share:

- Prefer file-only payloads for WhatsApp/mobile share where existing helpers do that.
- Avoid sending both text URL and file when it causes duplicate attachments.
- Always provide download fallback.

SVG/export rules:

- Inline SVG must be compatible with capture library.
- Prefer actual assets or generated bitmap backgrounds for rich public/export surfaces.
- Verify fonts are loaded before capture.

## Dark Mode

Dark mode uses `darkMode: 'class'`.

Rules:

- Every card, input, border, text, and popover needs a `dark:` pair.
- Avoid pure black except overlay/backdrop.
- Dashboard dark surfaces use `slate-800/900/950`.
- Portal uses translucent `slate-950/70` glass for top bars.
- Export templates may use their own fixed palettes and do not need to mirror dashboard dark mode.

## Accessibility & Interaction

- Icon-only buttons need `aria-label` or `title`.
- Dropdown panels use roles/aria where existing components do.
- Disabled controls must be visually disabled and non-clickable.
- Touch target size should be roughly 36-44px for primary mobile actions.
- Bottom sheets/fullscreen modals must close through obvious back/close controls.
- Search inputs inside dropdowns should focus without scrolling the page.
- Do not block page scroll globally unless a modal/sheet owns the viewport and restores scroll on close.

## Page-Specific Checklists

### New Dashboard Page

- Use `max-w-lg px-4 pt-4 pb-8`.
- Add lazy import in `DashboardLayout.tsx`.
- Use standard sticky header/back action if subpage.
- Use `SegmentedControl` for 2-4 modes.
- Use `FilterDropdown` for filters.
- Add dark mode classes.
- Track analytics only if the event is useful.

### New Form

- Use standard input/label/error classes.
- Validate required fields before submit.
- Preserve user input on server errors.
- Parse response text safely if the endpoint can return HTML/proxy errors.
- Use explicit loading state in submit button.

### New Public Page

- Public page should show the actual product/person/place early.
- Use real/generated bitmap assets where visual inspection matters.
- Update OG metadata path if share preview matters; untuk route yang dilayani SPA, pastikan Express menyuntikkan tag agar crawler tanpa JavaScript tetap membacanya.
- Verify OG dimensions, MIME type, cache header, canonical, alt text, and thumbnail readability using representative data.
- Do not make a marketing landing page when the route is intended to be a tool/app surface.

### New Export Template

- Define exact dimensions/aspect ratio.
- Load fonts and images before capture.
- Test longest package names, prices, names, and dates.
- Provide share/download fallback.

## Do's and Don'ts

Do:

- Reuse `SegmentedControl`, `FilterDropdown`, standard card/input/button classes.
- Keep UI text concise and action-oriented.
- Use Lucide icons for buttons and controls.
- Keep dashboard dense but readable.
- Use feature accents consistently.
- Check mobile text overflow.

Don't:

- Do not introduce native selects for dashboard filter work.
- Do not add unrelated decorative orbs/blobs.
- Do not create nested cards for whole sections.
- Do not use huge hero typography inside compact dashboard panels.
- Do not render raw upstream HTML errors.
- Do not add visible how-to text for obvious controls.
- Do not make one-off palettes that clash with emerald/slate base.

## Current Audit Notes (2026-07-12)

- Existing app intentionally uses `rounded-2xl` cards; preserve this unless a component-specific system says otherwise.
- Dashboard is mobile-first and `max-w-lg`; desktop should remain centered unless a feature explicitly needs a wider canvas/map/table.
- `FilterDropdown` is the canonical dropdown because it handles mobile scroll, portal positioning, and search.
- `SegmentedControl` is now reusable; prefer it over copying Settings tab code.
- `UmrahRegisterPage` has legacy-field-specific UI rules; keep docs and code aligned when legacy field mapping changes.
- Portal Jamaah uses glass headers and task cards; do not blindly copy dashboard card styles there if the portal component already has a local pattern.
- Dashboard flight card dan public flight share memakai `FlightRouteLine` serta status presentation yang sama; parity ini adalah kontrak UI.
- Flight share header hanya memuat identitas penerbangan dan share action. Badge status ditampilkan sekali pada hero untuk menghindari redundansi.
- Flight OG adalah aset dinamis `1200x630` dengan fakta itinerary stabil, bukan salinan layar status live.
