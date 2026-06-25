# Multi-Cover Katalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an agent choose 1 of 7 cover designs for the "Unduh Katalog" PDF in `/dashboard/brosur`, remembered per-device.

**Architecture:** A pure registry (`src/lib/catalogCovers.js` + `.d.ts`) lists 7 covers with per-cover overlay config. `BrochureCatalogCover` is refactored to render from a `cover` object (defaults = classic). A new `CatalogCoverPicker` modal lets the agent pick; `BrochureSchedulePage` holds the selection in `localStorage` and passes the chosen cover into the off-screen catalog render.

**Tech Stack:** React + TypeScript, Vite, Tailwind, lucide-react, `node:test` for unit tests. Pure logic = `.js`+`.d.ts` (imported by tests as `.js`, by FE via `@/lib/...`).

## Global Constraints

- Cover images live in `public/img-brosur/` (same-origin → safe for canvas capture). NOT routed through Bunny rewrite. Already downloaded: `cover-katalog-2.png`…`cover-katalog-7.png` (source `https://alhijaz.b-cdn.net/png/cover-katalog-N.png`).
- Cover rendering is **raster-safe**: only real `<img>`, CSS gradients, flat fills, solid borders — NO box-shadow blur / drop-shadow / text-shadow / background-clip:text / mask-image / filter. Legibility comes from the scrim only.
- Pure logic files are plain ESM `.js` + sibling `.d.ts` (pattern: `src/lib/hajiPlusPricing.js`). Tests import the `.js` directly; components import via `@/lib/<name>`.
- `@/*` → `src/*` (tsconfig + vite alias).
- Canvas constants: `BROCHURE_W = 1080`, `BROCHURE_H = 1620`.
- localStorage key: `catalogCoverId`. Default cover id: `classic`. Existing users (no key) must see zero behavior change.
- Baseline is clean: `npx tsc --noEmit` exits 0; `node --test tests/<file>` runs.

---

## File Structure

- **Create** `src/lib/catalogCovers.js` — registry + helpers (pure).
- **Create** `src/lib/catalogCovers.d.ts` — types for the above.
- **Create** `tests/catalog-covers.test.js` — unit + source-grep tests.
- **Create** `src/components/CatalogCoverPicker.tsx` — modal grid picker.
- **Modify** `src/components/BrochureScheduleTemplate.tsx` — `BrochureCatalogCover` reads a `cover` prop.
- **Modify** `src/components/BrochureSchedulePage.tsx` — selection state + localStorage + picker trigger + pass cover.
- **Commit** the 6 PNGs already in `public/img-brosur/`.

---

### Task 1: Cover registry (pure logic + assets)

**Files:**
- Create: `src/lib/catalogCovers.js`
- Create: `src/lib/catalogCovers.d.ts`
- Test: `tests/catalog-covers.test.js`
- Commit assets: `public/img-brosur/cover-katalog-2.png` … `-7.png`

**Interfaces:**
- Produces:
  - `CATALOG_COVERS: CatalogCover[]` (7 entries, `classic` first)
  - `DEFAULT_COVER_ID: string` (`'classic'`)
  - `getCatalogCover(id: string | null | undefined): CatalogCover` (falls back to default)
  - type `CatalogCover = { id: string; label: string; image: string; scrim?: string; ribbonGradient?: string; headlineColor?: string }`

- [ ] **Step 1: Write the failing test** — `tests/catalog-covers.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CATALOG_COVERS,
  DEFAULT_COVER_ID,
  getCatalogCover,
} from '../src/lib/catalogCovers.js';

const root = new URL('..', import.meta.url).pathname;

test('registry has 7 covers with unique non-empty ids/labels/images', () => {
  assert.equal(CATALOG_COVERS.length, 7);
  const ids = CATALOG_COVERS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  for (const c of CATALOG_COVERS) {
    assert.ok(c.id && typeof c.id === 'string', 'id non-empty');
    assert.ok(c.label && typeof c.label === 'string', 'label non-empty');
    assert.ok(c.image && c.image.startsWith('/img-brosur/'), 'image path under /img-brosur/');
  }
});

test('classic is the default and first entry', () => {
  assert.equal(DEFAULT_COVER_ID, 'classic');
  assert.equal(CATALOG_COVERS[0].id, 'classic');
  assert.ok(CATALOG_COVERS.some((c) => c.id === DEFAULT_COVER_ID));
});

test('getCatalogCover falls back to default for unknown/null/undefined', () => {
  assert.equal(getCatalogCover('ngawur').id, DEFAULT_COVER_ID);
  assert.equal(getCatalogCover(null).id, DEFAULT_COVER_ID);
  assert.equal(getCatalogCover(undefined).id, DEFAULT_COVER_ID);
});

test('getCatalogCover returns the matching cover for a known id', () => {
  assert.equal(getCatalogCover('sunset').id, 'sunset');
});

test('every cover image file exists in public/', () => {
  for (const c of CATALOG_COVERS) {
    const p = join(root, 'public', c.image);
    assert.ok(existsSync(p), `missing asset: ${c.image}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/catalog-covers.test.js`
Expected: FAIL — `Cannot find module '../src/lib/catalogCovers.js'`.

- [ ] **Step 3: Write minimal implementation** — `src/lib/catalogCovers.js`

```js
// Pure registry + helpers for catalog cover selection (Unduh Katalog PDF).
// No React / DOM / network — unit-tested in tests/catalog-covers.test.js.
// Frontend imports via '@/lib/catalogCovers' (types from catalogCovers.d.ts).

// Neutral dark top-gradient scrim: keeps the gold/white headline legible over the
// bright skies of cover 2–7. Raster-safe (flat gradient, no shadow/filter).
const BRIGHT_SCRIM =
  'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 32%, rgba(0,0,0,0) 58%)';

/** @type {import('./catalogCovers').CatalogCover[]} */
export const CATALOG_COVERS = [
  { id: 'classic',   label: 'Classic',       image: '/img-brosur/cover-katalog.png' },
  { id: 'siang',     label: 'Siang',         image: '/img-brosur/cover-katalog-2.png', scrim: BRIGHT_SCRIM },
  { id: 'ihram-1',   label: 'Ihram I',       image: '/img-brosur/cover-katalog-3.png', scrim: BRIGHT_SCRIM },
  { id: 'ihram-2',   label: 'Ihram II',      image: '/img-brosur/cover-katalog-4.png', scrim: BRIGHT_SCRIM },
  { id: 'sunset',    label: 'Sunset',        image: '/img-brosur/cover-katalog-5.png', scrim: BRIGHT_SCRIM },
  { id: 'doa',       label: 'Doa',           image: '/img-brosur/cover-katalog-6.png', scrim: BRIGHT_SCRIM },
  { id: 'berangkat', label: 'Keberangkatan', image: '/img-brosur/cover-katalog-7.png', scrim: BRIGHT_SCRIM },
];

export const DEFAULT_COVER_ID = 'classic';

/**
 * Resolve a stored/selected cover id to a CatalogCover, falling back to the
 * default cover for unknown / null / undefined ids.
 * @param {string | null | undefined} id
 * @returns {import('./catalogCovers').CatalogCover}
 */
export function getCatalogCover(id) {
  return (
    CATALOG_COVERS.find((c) => c.id === id) ||
    CATALOG_COVERS.find((c) => c.id === DEFAULT_COVER_ID) ||
    CATALOG_COVERS[0]
  );
}
```

- [ ] **Step 4: Write the type declaration** — `src/lib/catalogCovers.d.ts`

```ts
export interface CatalogCover {
  id: string;
  label: string;
  /** Public path to the full-bleed cover artwork, e.g. '/img-brosur/cover-katalog-2.png'. */
  image: string;
  /** CSS background for the headline scrim; falls back to the classic reddish scrim. */
  scrim?: string;
  /** CSS background for the agent ribbon; falls back to the classic maroon. */
  ribbonGradient?: string;
  /** Override for the headline accent color; falls back to classic gold. */
  headlineColor?: string;
}

export const CATALOG_COVERS: CatalogCover[];
export const DEFAULT_COVER_ID: string;
export function getCatalogCover(id: string | null | undefined): CatalogCover;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/catalog-covers.test.js`
Expected: PASS (5 tests, fail 0). The asset-existence test passes because the 6 PNGs are already in `public/img-brosur/`.

- [ ] **Step 6: Commit** (registry, types, test, and the 6 cover assets)

```bash
git add src/lib/catalogCovers.js src/lib/catalogCovers.d.ts tests/catalog-covers.test.js \
  public/img-brosur/cover-katalog-2.png public/img-brosur/cover-katalog-3.png \
  public/img-brosur/cover-katalog-4.png public/img-brosur/cover-katalog-5.png \
  public/img-brosur/cover-katalog-6.png public/img-brosur/cover-katalog-7.png
git commit -m "feat(brosur): catalog cover registry + 6 new cover assets"
```

---

### Task 2: `BrochureCatalogCover` reads a `cover` prop

**Files:**
- Modify: `src/components/BrochureScheduleTemplate.tsx` (cover constants near `CATALOG_HERO_IMAGE` ~line 153; `BrochureCatalogCoverProps` ~line 1137; component body ~line 1161–1219)

**Interfaces:**
- Consumes: `CatalogCover`, `getCatalogCover`, `DEFAULT_COVER_ID` from `@/lib/catalogCovers`.
- Produces: `BrochureCatalogCover` now accepts optional `cover?: CatalogCover` (defaults to classic). Existing call sites without `cover` keep compiling and render exactly as before.

- [ ] **Step 1: Add the import** near the other imports at the top of `src/components/BrochureScheduleTemplate.tsx`

```ts
import { getCatalogCover, DEFAULT_COVER_ID, type CatalogCover } from '@/lib/catalogCovers';
```

- [ ] **Step 2: Add classic default constants** right after the `const CATALOG_HERO_IMAGE = '/img-brosur/cover-katalog.png';` line, and update its comment to mention the new covers

Replace:
```ts
// Full-bleed designed cover artwork (Alhijaz logo, landmarks & jamaah photo baked
// in) synced from the agency CDN into public/. A real PNG → renders identically
// across capture engines. Re-sync from https://alhijaz.b-cdn.net/png/cover-katalog.png
// if the agency updates it.
const CATALOG_HERO_IMAGE = '/img-brosur/cover-katalog.png';
```
with:
```ts
// Full-bleed designed cover artwork (Alhijaz logo, landmarks & jamaah photo baked
// in) synced from the agency CDN into public/. A real PNG → renders identically
// across capture engines. The default/classic cover; alternatives live in
// src/lib/catalogCovers. Re-sync from https://alhijaz.b-cdn.net/png/cover-katalog-N.png
// (N omitted for classic) if the agency updates them.
const CATALOG_HERO_IMAGE = '/img-brosur/cover-katalog.png';

// Classic overlay defaults — used when a cover doesn't override them. Raster-safe.
const CLASSIC_COVER_SCRIM =
  'radial-gradient(58% 64% at 50% 30%, rgba(90,0,16,0.45) 0%, rgba(90,0,16,0) 72%)';
const CLASSIC_COVER_RIBBON =
  'linear-gradient(180deg, rgba(74,0,11,0) 0%, rgba(74,0,11,0.92) 28%, #3c0008 100%)';
```

- [ ] **Step 3: Extend the props type** (`BrochureCatalogCoverProps` ~line 1137)

Replace:
```ts
export interface BrochureCatalogCoverProps {
  agent: BrochureAgent;
  /** One entry per included month, in catalog (departure) order. */
  months: ReadonlyArray<{ label: string; count: number }>;
}
```
with:
```ts
export interface BrochureCatalogCoverProps {
  agent: BrochureAgent;
  /** One entry per included month, in catalog (departure) order. */
  months: ReadonlyArray<{ label: string; count: number }>;
  /** Selected cover; defaults to the classic cover. */
  cover?: CatalogCover;
}
```

- [ ] **Step 4: Resolve cover config at the top of the component body**

Change the signature line:
```ts
export function BrochureCatalogCover({ agent, months }: BrochureCatalogCoverProps) {
```
to:
```ts
export function BrochureCatalogCover({ agent, months, cover }: BrochureCatalogCoverProps) {
```
Then, right after the existing `const GOLD = '#E8C36B';` line inside the component, add:
```ts
  const resolvedCover = cover ?? getCatalogCover(DEFAULT_COVER_ID);
  const coverImage = resolvedCover.image;
  const coverScrim = resolvedCover.scrim ?? CLASSIC_COVER_SCRIM;
  const coverRibbon = resolvedCover.ribbonGradient ?? CLASSIC_COVER_RIBBON;
  const headlineGold = resolvedCover.headlineColor ?? GOLD;
```

- [ ] **Step 5: Use the resolved values in the JSX**

5a. The full-bleed image — replace:
```tsx
      <img src={CATALOG_HERO_IMAGE} alt="" aria-hidden="true" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0,
      }} />
```
with:
```tsx
      <img
        src={coverImage}
        alt=""
        aria-hidden="true"
        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = CATALOG_HERO_IMAGE; }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
      />
```

5b. The scrim div — replace its `background: 'radial-gradient(58% 64% at 50% 30%, rgba(90,0,16,0.45) 0%, rgba(90,0,16,0) 72%)',` line with:
```tsx
        background: coverScrim,
```

5c. The headline accent — in the `<div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 13, color: GOLD }}>KATALOG UMROH</div>` line, change `color: GOLD` to `color: headlineGold`; and in the gold divider `<div style={{ width: 96, height: 3, borderRadius: 2, background: GOLD, ... }} />` change `background: GOLD` to `background: headlineGold`.

5d. The ribbon container — replace its `background: 'linear-gradient(180deg, rgba(74,0,11,0) 0%, rgba(74,0,11,0.92) 28%, #3c0008 100%)',` line with:
```tsx
        background: coverRibbon,
```

> Leave the ribbon's gold accents (avatar border, WhatsApp icon, phone) on the existing `GOLD` — they read on any dark ribbon and stay on-brand.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0, no output. (Existing `<BrochureCatalogCover agent month />` call site still compiles because `cover` is optional and renders classic — identical to before.)

- [ ] **Step 7: Commit**

```bash
git add src/components/BrochureScheduleTemplate.tsx
git commit -m "feat(brosur): BrochureCatalogCover renders from a cover config (default=classic)"
```

---

### Task 3: `CatalogCoverPicker` modal

**Files:**
- Create: `src/components/CatalogCoverPicker.tsx`

**Interfaces:**
- Consumes: `CATALOG_COVERS` from `@/lib/catalogCovers`.
- Produces: `CatalogCoverPicker` (named + default export) with props `{ open: boolean; selectedId: string; onSelect: (id: string) => void; onClose: () => void }`.

- [ ] **Step 1: Create the component** — `src/components/CatalogCoverPicker.tsx`

```tsx
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { CATALOG_COVERS } from '@/lib/catalogCovers';

export interface CatalogCoverPickerProps {
  open: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet grid for choosing the catalog PDF cover. Live on-screen UI (NOT
 * captured into the PDF), so normal CSS effects are fine here. Lazy-mounts:
 * returns null when closed, so the cover artwork is only fetched once the agent
 * opens the picker. Selection is persisted by the parent (localStorage).
 */
export function CatalogCoverPicker({ open, selectedId, onSelect, onClose }: CatalogCoverPickerProps) {
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pilih cover katalog"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(8,2,5,0.62)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-white dark:bg-slate-900"
        style={{
          maxWidth: 480, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 -16px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-base font-bold text-gray-900 dark:text-white">Pilih Cover Katalog</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">Dipakai untuk PDF & diingat di perangkat ini</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CATALOG_COVERS.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-pressed={active}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all active:scale-[0.98] ${
                    active ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-gray-200 dark:border-slate-700'
                  }`}
                  style={{ aspectRatio: '2 / 3' }}
                >
                  <img src={c.image} alt={c.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  {active && (
                    <span className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                      <Check size={15} strokeWidth={3} />
                    </span>
                  )}
                  <span
                    className="absolute bottom-0 inset-x-0 px-2 py-1 text-[11px] font-semibold text-white text-left"
                    style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)' }}
                  >
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CatalogCoverPicker;
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/CatalogCoverPicker.tsx
git commit -m "feat(brosur): CatalogCoverPicker bottom-sheet grid"
```

---

### Task 4: Wire selection into `BrochureSchedulePage`

**Files:**
- Modify: `src/components/BrochureSchedulePage.tsx` (imports ~lines 9 & 27; catalog state block ~line 264; render: trigger above Unduh Katalog button ~line 968; picker near `<CatalogLoadingModal>` ~line 985; off-screen cover render ~line 1140)
- Modify: `tests/catalog-covers.test.js` (append wiring source-grep test)

**Interfaces:**
- Consumes: `getCatalogCover`, `DEFAULT_COVER_ID` from `@/lib/catalogCovers`; `CatalogCoverPicker` from `./CatalogCoverPicker`; `BrochureCatalogCover` (now accepts `cover`).

- [ ] **Step 1: Add the wiring source-grep test** (append to `tests/catalog-covers.test.js`)

```js
test('BrochureSchedulePage wires the cover picker + persistence', () => {
  const src = readFileSync(join(root, 'src/components/BrochureSchedulePage.tsx'), 'utf8');
  assert.match(src, /'catalogCoverId'/, 'uses localStorage key catalogCoverId');
  assert.match(src, /getCatalogCover/, 'imports/uses getCatalogCover');
  assert.match(src, /<CatalogCoverPicker/, 'renders CatalogCoverPicker');
  assert.match(src, /cover=\{getCatalogCover\(coverId\)\}/, 'passes selected cover to BrochureCatalogCover');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/catalog-covers.test.js`
Expected: FAIL on the new test (BrochureSchedulePage has none of those strings yet). The Task 1 tests still pass.

- [ ] **Step 3: Add imports** to `src/components/BrochureSchedulePage.tsx`

After the existing `import { CatalogLoadingModal } from './CatalogLoadingModal';` (~line 27) add:
```ts
import { CatalogCoverPicker } from './CatalogCoverPicker';
import { getCatalogCover, DEFAULT_COVER_ID } from '@/lib/catalogCovers';
```

- [ ] **Step 4: Add selection state** in the catalog state area (right after `const [catalogStage, setCatalogStage] = useState<...>(null);` ~line 264)

```ts
  const [coverId, setCoverId] = useState<string>(() => {
    try { return getCatalogCover(localStorage.getItem('catalogCoverId')).id; }
    catch { return DEFAULT_COVER_ID; }
  });
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const selectCover = (id: string) => {
    setCoverId(id);
    try { localStorage.setItem('catalogCoverId', id); } catch { /* private mode: ignore */ }
  };
```

- [ ] **Step 5: Add the picker trigger** immediately before the `{/* Unduh Katalog — full-width. ... */}` block (~line 967, just before its `<div className="px-4 pt-3">`)

```tsx
      {/* Cover picker trigger — chosen cover is remembered per-device */}
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={() => setCoverPickerOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 text-left active:scale-[0.99] transition-all"
        >
          <img
            src={getCatalogCover(coverId).image}
            alt=""
            className="h-10 w-[26px] rounded object-cover border border-gray-200 dark:border-slate-700 shrink-0"
          />
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] text-gray-500 dark:text-slate-400">Cover katalog</span>
            <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{getCatalogCover(coverId).label}</span>
          </span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">Ganti</span>
        </button>
      </div>
```

- [ ] **Step 6: Render the picker** right after the `<CatalogLoadingModal ... />` element (~line 985–1000, after its closing `/>`)

```tsx
      <CatalogCoverPicker
        open={coverPickerOpen}
        selectedId={coverId}
        onSelect={selectCover}
        onClose={() => setCoverPickerOpen(false)}
      />
```

- [ ] **Step 7: Pass the chosen cover** into the off-screen cover render (~line 1140)

Replace:
```tsx
          {catalogStage?.kind === 'cover' && (
            <BrochureCatalogCover agent={agent} months={catalogMeta.summary} />
          )}
```
with:
```tsx
          {catalogStage?.kind === 'cover' && (
            <BrochureCatalogCover agent={agent} months={catalogMeta.summary} cover={getCatalogCover(coverId)} />
          )}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test tests/catalog-covers.test.js`
Expected: PASS (all tests, fail 0).

- [ ] **Step 9: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 10: Commit**

```bash
git add src/components/BrochureSchedulePage.tsx tests/catalog-covers.test.js
git commit -m "feat(brosur): cover picker UI + per-device persistence in Unduh Katalog"
```

---

### Task 5: Final verification

**Files:** none (verification only; commit only if a fix is needed).

- [ ] **Step 1: Full SPA build**

Run: `npm run build:spa`
Expected: build succeeds (exit 0), no type/import errors.

- [ ] **Step 2: Run the full unit test file**

Run: `node --test tests/catalog-covers.test.js`
Expected: PASS, fail 0.

- [ ] **Step 3: Manual verification (human, `npm run dev` → `/dashboard/brosur`)**

  - The "Cover katalog" trigger shows the classic thumbnail + "Classic" on first load (no localStorage key).
  - Click "Ganti" → bottom-sheet shows 7 covers; classic highlighted.
  - Pick "Sunset" → trigger updates to the sunset thumb/label; reload the page → still "Sunset" (persisted).
  - Click "Unduh Katalog (PDF)" → first PDF page is the sunset cover; headline "KATALOG UMROH / Paket Umroh / <range>" is legible over the bright sky; agent ribbon (photo, name, WA) at the bottom.
  - Switch back to "Classic" → catalog cover matches the original exactly (no regression).

- [ ] **Step 4 (optional): Re-sync the registry comment** if any extra covers were added later. No commit if Steps 1–3 pass clean.

---

## Self-Review

**Spec coverage:**
- 7 covers + designer PNGs in public/ → Task 1 (registry + asset commit + existence test). ✓
- localStorage persistence, default classic, backward-compatible → Task 4 Step 4 (`getCatalogCover(localStorage…)`, default fallback). ✓
- Registry + per-cover config, one component → Task 1 (registry) + Task 2 (component reads config). ✓
- Headline kept on all, per-cover scrim, raster-safe → Task 1 `BRIGHT_SCRIM` + Task 2 `coverScrim`/`headlineGold`. ✓
- Ribbon kept on all (maroon default, override field) → Task 2 `coverRibbon`. ✓
- Picker modal, lazy-mount, full-image lazy thumbnails → Task 3. ✓
- Trigger above Unduh Katalog → Task 4 Step 5. ✓
- Edge cases: invalid id → default (Task 1 `getCatalogCover`); missing image → onError fallback (Task 2 Step 5a); localStorage failure → try/catch (Task 4 Step 4). ✓
- Out of scope (winter theme, backend sync, in-app editing) → untouched. ✓

**Placeholder scan:** none — all steps contain concrete code/commands.

**Type consistency:** `CatalogCover` fields (`id/label/image/scrim?/ribbonGradient?/headlineColor?`) consistent across `.d.ts`, registry, and component. `getCatalogCover` / `DEFAULT_COVER_ID` / `CATALOG_COVERS` names consistent across Tasks 1–4. `coverId` state name consistent in Task 4 Steps 4–7 and the grep test in Step 1.
