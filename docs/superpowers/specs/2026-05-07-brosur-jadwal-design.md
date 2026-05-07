# Brosur Jadwal Generator — Design

**Date:** 2026-05-07
**Status:** Approved (pending implementation plan)
**Owner:** Bagas

## Overview

A new tool under **Tools > Brosur Jadwal** that auto-renders a monthly Umroh package brochure for the logged-in agent. The brochure groups packages by departure month, shows them in a styled table, and brands the output with the agent's photo, name, WhatsApp number, and website. Agents can switch months via a tab bar, then **share** (Web Share API) or **download PNG** the rendered brochure.

The visual style follows the user's reference brochure: red gradient background, Masjidil Haram crowd photo at the bottom, white-on-red package table, and a footer pill with agent info plus a website strip.

## Goals

- Give every agent a one-click monthly promotional brochure they can post on Instagram Story / WhatsApp Status / broadcast.
- Use existing schedule data (already synced via `awapi-client.js` to Supabase) — no new sync paths.
- Match the reference brochure's visual language (red AIW palette) while reusing the template/PNG-capture pattern from `KursShareTemplates.tsx`.
- Personalize with agent photo + name + WA + website without requiring per-agent customization.

## Non-Goals

- **No server-side PNG rendering.** All capture happens client-side via `snapdom`. (No broadcast use case yet — adding the dual template would be premature.)
- **No bulk admin generator.** Each agent generates only their own brochure.
- **No price customization per agent.** Brochures show the published kantor price for all agents (consistent across the company).
- **No editor.** Users cannot reorder packages, hide rows, change colors, or swap the Mecca background. Layout is fixed.
- **No PDF export.** PNG only.

## User Flow

1. Agent opens dashboard → clicks **Tools** in side nav.
2. Sees grid of tool cards including new **Brosur Jadwal** card.
3. Clicks card → routes to `BrochureSchedulePage`.
4. Page fetches `GET /api/brochure/jadwal-bulan?monthsAhead=24` — returns months that have at least one upcoming package.
5. Tab bar appears with months (e.g. `Mei | Jun | Jul | Aug | Sep | Okt`). Default selected = current month, or the nearest upcoming month if current month has no packages.
6. Brochure for the active month renders below the tabs.
7. Agent can:
   - Tap a different month tab → brochure re-renders for that month.
   - Tap **Share** → `navigator.share` opens system share sheet with PNG file. Falls back to download if Web Share API does not support files.
   - Tap **Download PNG** → saves `brosur-paket-umroh-{nama-bulan}-{yyyy}.png` locally.

## Architecture

### Frontend (new files)

```
src/components/
├── BrochureSchedulePage.tsx          (route page)
└── BrochureScheduleTemplates.tsx     (template component, fixed 1080×1920)
```

### Backend (additions to server.js)

```
GET /api/brochure/jadwal-bulan?monthsAhead=24
  → reads from Supabase `umroh_schedules` (existing table, already synced via syncUmrohSchedules)
  → filters berangkat_tgl >= today AND <= today + monthsAhead months
  → resolves min Quard/Triple/Double price per package
  → groups by YYYY-MM
  → returns only months with ≥1 package
```

### Tools menu integration

Add new card to the `TOOLS` array in `AIToolsPage.tsx`:

```ts
{
  id: 'brosur-jadwal',
  name: 'Brosur Jadwal',
  desc: 'Brosur paket umroh per bulan',
  icon: <Calendar | FileImage | similar lucide icon>,
  color: 'red',
  active: true,
  route: 'brosur-jadwal',
}
```

Add `'brosur-jadwal'` route case in `DashboardLayout.tsx` to render `BrochureSchedulePage`.

## Data Contract

### `GET /api/brochure/jadwal-bulan`

**Query params:**
- `monthsAhead` (optional, default 24, max 36) — number of months from today to include.

**Auth:** Standard agent JWT middleware (same as other endpoints).

**Response:**

```json
{
  "months": [
    {
      "key": "2026-06",
      "label": "Juni 2026",
      "monthIndexId": 5,
      "year": 2026,
      "packages": [
        {
          "id": 12345,
          "nama": "REGULER 9HR (KERETA CEPAT)",
          "berangkat_tgl": "2026-06-13",
          "pulang_tgl": "2026-06-20",
          "maskapai": "SAUDIA",
          "harga": 33900000
        }
      ]
    }
  ],
  "agent": {
    "name": "Nikita",
    "phone": "0822-9000-20",
    "photo": "<url>",
    "website": "alhijazindonesia.com"
  }
}
```

**Source field mapping:** Read from existing `umroh_schedules` table (synced via `syncUmrohSchedules` in server.js). Schema-relevant columns: `jadwal_id`, `jadwal_nama`, `year_code`, `maskapai`, `berangkat_tgl`, `pulang_tgl`, `paket_harga`.

`paket_harga` is JSONB shaped like:
```json
{
  "Hotel Bintang 5": { "Quard": 33900000, "Triple": 35000000, "Double": 38000000, "Infant": 5000000 },
  "Hotel Bintang 4": { ... }
}
```

For the brochure single-price display (matches reference "starting from" style), pick the **minimum `Quard` price across all hotel tiers**. Fallback chain per tier: `Quard` → `Triple` → `Double` (skip `Infant` — that's per-baby surcharge, not the package price). Final brochure price = min over all hotel tiers using that fallback. If after all fallbacks no positive price exists, exclude the package with a server log warning. Server uses existing `hasValidPricing(paket_harga)` helper at server.js:10153 to confirm at least one positive price exists before resolving the min.

**Sort:** Within each month, packages sorted by `berangkat_tgl` ascending (matches reference: 13 Jun before 16 Jun before 17 Jun).

**Filter:** Only packages with `berangkat_tgl >= today` (don't show past departures even if month is current).

**Truncation:** Server returns up to 10 packages per month. If more exist, `packages` array is truncated and the response includes `truncatedCount: <N>` for that month — client renders a "+ N paket lainnya" footnote.

## Visual Design (Template)

**Dimensions:** 1080 × 1920 (9:16 portrait — full Instagram Story / WhatsApp Status).

**Color palette:**
- Primary red gradient: `#C8102E → #8B0000` (top → bottom)
- Accent red (table header): `#A00020`
- White: `#FFFFFF` (table rows, title)
- Cream/Gold accents: `#F8DFA1` (avatar border, dividers — match KursTemplate)
- Mecca photo overlay: opacity ~0.35

**Typography:**
- Font stack: same as KursTemplate (`'Inter', system-ui, …`)
- Weights used: 600, 700, 800, 900
- Title "PAKET UMROH" + "{BULAN} {YYYY}": weight 900, all caps, letter-spacing -1, drop shadow

**Layout (top → bottom):**

| Section | Height | Notes |
|---|---|---|
| Header bar | ~200px | AIW logo top-left (use `/logo-alhijaz-besar.svg`); 2 small badge icons top-right (Sertifikasi + "5 Pasti Umrah" — placeholder SVG icons in red/gold for now) |
| Title block | ~280px | "PAKET UMROH" line 1 (font-size 110px) + "{BULAN} {YYYY}" line 2 (font-size 130px), white with subtle red shadow, centered |
| Package table | flex, ~900–1100px | Header row (No / PAKET / BERANGKAT / PULANG / MASKAPAI / HARGA) on red bg; data rows on white bg with light separator. Row height adapts: 7 rows = 110px each; 10 rows = 90px. Column widths: No 60 / Paket 360 / Berangkat 160 / Pulang 160 / Maskapai 130 / Harga 200 |
| Mecca photo | ~600px (absolute positioned overlay behind footer) | Crowd photo with red gradient mask blending into footer area |
| Footer pill | ~220px | Glassmorphism card (semi-transparent dark red bg + cream border): 140px round avatar (4px gold border) on left + "Info & Pendaftaran:" small label + agent name (large, weight 800) + "({phone formatted})" |
| Website strip | ~80px | Full-width dark-red strip, centered text "{website}" white, weight 700 |

**Package row formatting:**
- **No.** — sequential 1, 2, 3 …
- **Paket** — render `nama` as-is from API (only `.toUpperCase()` applied). Any stars (⭐⭐⭐), trains (🚄), or other glyphs in the reference image are assumed to already be in the source string from the API or to have been added by the kantor manually. **No auto-augmentation** of the package name (rationale: the API already controls package presentation; auto-injection risks duplicating glyphs that already exist or adding glyphs the kantor does not want).
- **Berangkat / Pulang** — `dd MMM yyyy` with Indonesian month abbreviation (`JAN FEB MAR APR MEI JUN JUL AGT SEP OKT NOV DES`), all caps.
- **Maskapai** — uppercase as-is from API.
- **Harga** — `Rp {N.N} Jt` where `{N.N}` is `(harga / 1_000_000)` rounded to 1 decimal. The number is significantly larger weight than "Rp" and "Jt" labels (matches reference).

**Helper to add to template file:**

```ts
function formatHargaJt(harga: number): string {
  // Round to nearest 100k juta-precision (e.g. 33_950_000 → 34.0, 33_949_999 → 33.9).
  // JS Math.round is half-away-from-zero for positive numbers, so .x5 rounds up.
  const jt = Math.round(harga / 100_000) / 10;
  return jt.toFixed(1);
}

function formatTglID(iso: string): string {
  const m = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGT','SEP','OKT','NOV','DES'];
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')} ${m[d.getMonth()]} ${d.getFullYear()}`;
}
```

**Phone display:** Use `normalizeWaNumber` from `src/utils/phone.ts` (mandated by anti-pattern checklist 14 in memory). Display format on brochure: parenthesized human-readable (e.g. "(0822-9000-20)") — strip the leading 62 and re-add 0, group as `0xxx-xxxx-xx`. Helper to be added to template file.

## Capture & Share

**Capture library:** `snapdom` (already a dependency, used by KursShareTemplates).

```ts
const node = brochureRef.current;
const result = await snapdom(node, { scale: 2, embedFonts: true });
const blob = await result.toBlob({ type: 'image/png' });
```

**Share flow:**

```ts
const file = new File([blob], filename, { type: 'image/png' });
if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file], title: `Brosur Paket Umroh ${monthLabel}`, text: `Paket Umroh ${monthLabel} dari ${agent.name}` });
} else {
  // fallback: trigger download + toast
  triggerDownload(blob, filename);
  toast('Browser tidak support share langsung, brosur ter-download.');
}
```

**Download flow:** Standard `<a href={URL.createObjectURL(blob)} download={filename}>` click trick; revoke URL after.

**Filename:** `brosur-paket-umroh-{slug-bulan}-{yyyy}.png` — `slug-bulan` is `juni` / `juli` / etc. (lowercase Indonesian month name).

## Edge Cases

1. **No packages at all (any month):** Page shows empty state — heading "Belum ada jadwal paket yang aktif" + small explainer. No tabs, no template render.
2. **Tab month switches but no packages for that month:** Cannot happen by design — server only returns months with ≥1 package, so every tab is non-empty.
3. **More than 10 packages in a month:** Server truncates to top 10 by `berangkat_tgl asc`. Template renders truncated list + footnote row "+ {N} paket lainnya — hubungi {agent.name}" in a single small row at the bottom of the table.
4. **Agent photo missing or 404:** Fallback to `ui-avatars.com` (same pattern as KursTemplate's `avatarFallback`).
5. **Agent website missing:** Show default "alhijazindonesia.com" in the website strip.
6. **Agent phone missing:** Show "—" in the phone slot (fallback to website-only). This is a legitimate state (some test agents).
7. **Snapdom capture fails:** Catch error, show toast "Gagal generate brosur, coba lagi". Log to Sentry.
8. **Web Share API rejects (user cancels share sheet):** Silent — no error toast for `AbortError`.
9. **Loading state:** Skeleton placeholder for tab bar (3 grey pills) and brochure frame (red gradient placeholder with pulse animation).
10. **Tab overflow (>7 months):** Tab bar is horizontally scrollable; current tab `scrollIntoView({ inline: 'center' })` on mount and on switch.

## Testing

**Unit tests (`tests/`):**
- `formatHargaJt`: 33_900_000 → "33.9", 41_700_000 → "41.7", 36_950_000 → "37.0" (`Math.round(369.5)` = 370 in JS, half-away-from-zero), 33_949_999 → "33.9". Inputs `0` / `null` / `undefined` are server-side filtered (excluded from response), so the helper does NOT need to handle them — fail loud with a typecheck rather than masking missing data.
- `formatTglID`: 2026-06-13 → "13 JUN 2026", boundary months Jan/Dec.
- Server: `groupPackagesByMonth` correctly groups, sorts, filters past, truncates to 10.

**Smoke / visual:**
- Render template with mock data: 3 packages, 7 packages (matches reference), 10 packages, 11+ packages (verify truncation footnote). Visual eyeball — does layout breathe, does table fit, no overflow.
- Test on actual phone (iOS Safari, Android Chrome) for `navigator.share` behavior with files.

**Integration:**
- Endpoint returns expected shape for an agent with mocked `umroh_packages` rows.
- Auth required — unauthenticated request returns 401.

## Open Implementation Questions (resolved during build, not requiring user re-confirm)

- **Mecca photo source:** Use existing CDN asset if Alhijaz already has one in `/public`; otherwise pick a royalty-free Unsplash crowd photo and bundle it. Do not hot-link external.
- **Top-right badge icons:** Two small SVG badges. If Alhijaz has existing branded assets ("Sertifikasi Kemenag" + "5 Pasti Umrah"), use those; otherwise approximate with generic seal icons in red/gold.
- **Hotel tier room sort order:** Resolved — pick min Quard across hotel tiers, fallback Triple → Double, skip Infant. Document above.

## Anti-Pattern Compliance

Cross-referenced with `project_sync_bug_patterns.md`:

- **Item 14 (phone normalization):** MUST use `normalizeWaNumber` from `src/utils/phone.ts`. NO inline regex like `wa.replace(/^0/, '62')`.
- **Sync impact:** This feature reads from existing `umroh_packages` table. It does NOT introduce new sync paths, NOT modify existing sync, NOT add upserts. Patterns 1–7 do not apply.
- **No CAPI events fired** from this feature.
