# Konten Category Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins add, edit, delete (with content reassignment), and reorder content categories for Caption, FAQ, and Tour Leader in `/dashboard/konten`.

**Architecture:** Categories become first-class records in the existing in-memory `useWaCopyContent` store (the API-swap seam). The compile-time union types relax to `string`, the category icon moves from a React component (`icon`) to a serializable name (`iconName`) resolved through a registry, and pure category logic lives in a framework-free `categoryOps.js` module (runtime-tested). A per-tab **Kelola Kategori** button opens a scoped `CategoryManager` view that reuses the existing list↔editor view-swap pattern.

**Tech Stack:** React 18 + TypeScript (Vite, bundler resolution), Tailwind, lucide-react. No component/state libraries. Tests are `node:test` — pure logic via `.js` modules + `.d.ts` (runtime import), UI via source-string assertions.

---

## Conventions for this plan

- **Test command:** `node --test tests/<file>.test.js` (one file) or `node --test tests/*.test.js` (all). There is no `npm test` script.
- **Type-check:** `npx tsc -p tsconfig.json --noEmit` (must exit 0).
- **Build:** `npm run build` (Vite). Run at the end and after risky tasks.
- **Baseline (before this plan):** `tsc` is clean. `node --test tests/*.test.js` has exactly **2 pre-existing failures** — `wa-copy-faq-compact.test.js` tests #1 and #3 (card *styling* drift on `FaqAccordionItem`, unrelated to categories). These two are out of scope; do **not** try to fix them. Every other wa-copy test must stay green, and test #2 of faq-compact ("does not render a category badge inside the accordion card") must stay green.
- **Deliberate deviation from the spec:** the seed metadata constants keep their current names (`CAPTION_CATEGORIES`, `FAQ_CATEGORIES`, `TOUR_PHASES`) instead of being renamed to `*_CATEGORY_SEED`. They become seed-only (imported solely by the hook). Keeping the names avoids needless churn across files; the behavior is identical to the spec.
- **The `icon → iconName` migration is staged** (add `iconName`+`order` while keeping `icon` optional → migrate consumers → drop `icon`) so every task leaves `tsc`/build green and is independently committable.
- Branch: work on `main` (per project convention). Verify `git branch --show-current` before each commit.

## File Structure

**Create:**
- `src/components/wa-copy/lib/categoryOps.js` — pure category logic (slug, unique id, append, patch, reorder, delete+reassign). Runtime-testable.
- `src/components/wa-copy/lib/categoryOps.d.ts` — type declarations for the above.
- `src/components/wa-copy/lib/categoryIcons.ts` — curated lucide icon registry + `resolveCategoryIcon`.
- `src/components/wa-copy/admin/IconPicker.tsx` — icon-grid picker.
- `src/components/wa-copy/admin/CategoryEditor.tsx` — create/edit category form.
- `src/components/wa-copy/admin/DeleteCategoryPanel.tsx` — delete + reassign-to-another-category panel.
- `src/components/wa-copy/admin/CategoryManager.tsx` — per-kind category manager view.
- `tests/wa-copy-category-ops.test.js` — runtime unit tests for `categoryOps.js`.
- `tests/wa-copy-category-manager.test.js` — source-string tests for hook mutations + manager wiring.

**Modify:**
- `src/components/wa-copy/lib/types.ts` — unions → `string`; `CategoryMeta` `icon`→`iconName`+`order`; add `CategoryDraft`.
- `src/components/wa-copy/lib/captions.ts`, `faq.ts`, `tourleader.ts` — seed metadata to new shape.
- `src/components/wa-copy/hooks/useWaCopyContent.ts` — category slices + 12 mutations.
- `src/components/wa-copy/admin/WaCopyAdminPage.tsx` — live label/order maps, Kelola Kategori button, manager view, back routing.
- `src/components/wa-copy/admin/CaptionEditor.tsx`, `FaqEditor.tsx`, `TourLeaderEditor.tsx` — categories via prop.
- `src/components/wa-copy/tabs/caption/CaptionTab.tsx`, `caption/CaptionCard.tsx`, `faq/FaqTab.tsx`, `tourleader/TourLeaderTab.tsx` — categories from hook + `resolveCategoryIcon`.
- `tests/wa-copy-admin-back.test.js` — extend the back/open-state contract to cover the manager.

---

### Task 1: Pure category operations module

**Files:**
- Create: `src/components/wa-copy/lib/categoryOps.js`
- Create: `src/components/wa-copy/lib/categoryOps.d.ts`
- Test: `tests/wa-copy-category-ops.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/wa-copy-category-ops.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugifyCategory,
  uniqueCategoryValue,
  appendCategory,
  patchCategory,
  reorderCategory,
  deleteCategoryAndReassign,
} from '../src/components/wa-copy/lib/categoryOps.js';

const cats = () => [
  { value: 'a', label: 'A', iconName: 'Heart', tip: '', order: 1 },
  { value: 'b', label: 'B', iconName: 'Wallet', tip: '', order: 2 },
  { value: 'c', label: 'C', iconName: 'Tag', tip: '', order: 3 },
];

test('slugifyCategory normalizes labels and falls back to "kategori"', () => {
  assert.equal(slugifyCategory('Ringan di Kantong'), 'ringan-di-kantong');
  assert.equal(slugifyCategory('Tips & Info!'), 'tips-info');
  assert.equal(slugifyCategory('   '), 'kategori');
});

test('uniqueCategoryValue de-duplicates with numeric suffixes', () => {
  const taken = new Set(['promo', 'promo-2']);
  assert.equal(uniqueCategoryValue('baru', taken), 'baru');
  assert.equal(uniqueCategoryValue('promo', taken), 'promo-3');
});

test('appendCategory adds a slugged, ordered, trimmed record', () => {
  const next = appendCategory(cats(), { label: '  Promo Akhir Tahun ', iconName: 'Gift', tip: '  hemat  ' });
  assert.equal(next.length, 4);
  const added = next[3];
  assert.equal(added.value, 'promo-akhir-tahun');
  assert.equal(added.label, 'Promo Akhir Tahun');
  assert.equal(added.tip, 'hemat');
  assert.equal(added.order, 4);
});

test('appendCategory keeps the value unique against existing ids', () => {
  const list = [{ value: 'promo', label: 'Promo', iconName: 'Gift', tip: '', order: 1 }];
  const next = appendCategory(list, { label: 'Promo', iconName: 'Gift', tip: '' });
  assert.equal(next[1].value, 'promo-2');
});

test('patchCategory updates display fields but keeps value stable', () => {
  const next = patchCategory(cats(), 'b', { label: ' Beta ', iconName: 'Star' });
  const b = next.find(c => c.value === 'b');
  assert.equal(b.value, 'b');
  assert.equal(b.label, 'Beta');
  assert.equal(b.iconName, 'Star');
  assert.equal(b.order, 2);
});

test('reorderCategory swaps order with the neighbour and is a no-op at bounds', () => {
  const up = reorderCategory(cats(), 'b', 'up');
  assert.equal(up.find(c => c.value === 'b').order, 1);
  assert.equal(up.find(c => c.value === 'a').order, 2);
  const noop = reorderCategory(cats(), 'a', 'up');
  assert.deepEqual(noop, cats());
});

test('deleteCategoryAndReassign moves items to the target with appended order, no orphans', () => {
  const items = [
    { id: 'i1', category: 'a', order: 1 },
    { id: 'i2', category: 'a', order: 2 },
    { id: 'i3', category: 'b', order: 1 },
  ];
  const res = deleteCategoryAndReassign(cats(), items, 'category', 'a', 'b');
  assert.ok(res);
  assert.equal(res.categories.length, 2);
  assert.ok(!res.categories.some(c => c.value === 'a'));
  assert.ok(!res.items.some(it => it.category === 'a')); // no orphans
  const inB = res.items.filter(it => it.category === 'b').map(it => it.order).sort();
  assert.deepEqual(inB, [1, 2, 3]); // i3 stays 1, i1/i2 appended 2,3
});

test('deleteCategoryAndReassign rejects invalid deletions (null result)', () => {
  const one = [{ value: 'only', label: 'Only', iconName: 'Tag', tip: '', order: 1 }];
  assert.equal(deleteCategoryAndReassign(one, [], 'category', 'only', 'only'), null); // last category
  assert.equal(deleteCategoryAndReassign(cats(), [], 'category', 'a', 'a'), null);      // same target
  assert.equal(deleteCategoryAndReassign(cats(), [], 'category', 'a', 'zzz'), null);    // missing target
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/wa-copy-category-ops.test.js`
Expected: FAIL — `Cannot find module '.../categoryOps.js'`.

- [ ] **Step 3: Implement `categoryOps.js`**

Create `src/components/wa-copy/lib/categoryOps.js`:

```js
// Pure, framework-free helpers for managing WA Copy categories.
// No React / DOM / store — unit-tested in tests/wa-copy-category-ops.test.js.

/** Slugify a label into a stable category id (a-z0-9 + hyphens). */
export function slugifyCategory(label) {
  const base = String(label)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'kategori';
}

/** Ensure `base` is unique against `taken`, appending -2, -3, … on collision. */
export function uniqueCategoryValue(base, taken) {
  const set = taken instanceof Set ? taken : new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Append a new category record (value derived from label, order = max+1). */
export function appendCategory(list, draft) {
  const taken = new Set(list.map(c => c.value));
  const value = uniqueCategoryValue(slugifyCategory(draft.label), taken);
  const order = list.reduce((m, c) => Math.max(m, c.order), 0) + 1;
  return [
    ...list,
    { value, label: draft.label.trim(), iconName: draft.iconName, tip: (draft.tip ?? '').trim(), order },
  ];
}

/** Patch an existing category's display fields; `value` and `order` stay stable. */
export function patchCategory(list, value, patch) {
  return list.map(c => {
    if (c.value !== value) return c;
    const next = { ...c };
    if (patch.label !== undefined) next.label = patch.label.trim();
    if (patch.iconName !== undefined) next.iconName = patch.iconName;
    if (patch.tip !== undefined) next.tip = (patch.tip ?? '').trim();
    return next;
  });
}

/** Swap a category's order with its neighbour (sorted by order). No-op at bounds. */
export function reorderCategory(list, value, dir) {
  const sorted = [...list].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(c => c.value === value);
  if (idx < 0) return list;
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sorted.length) return list;
  const a = sorted[idx];
  const b = sorted[swap];
  const aOrder = a.order;
  return list.map(c => {
    if (c.value === a.value) return { ...c, order: b.order };
    if (c.value === b.value) return { ...c, order: aOrder };
    return c;
  });
}

/**
 * Delete a category and reassign its content to `reassignTo`.
 * `field` is the content's category key ('category' for caption/faq, 'phase' for tour).
 * Returns { categories, items } or null when rejected (last category, same target,
 * missing source/target).
 */
export function deleteCategoryAndReassign(list, items, field, value, reassignTo) {
  if (list.length <= 1) return null;
  if (value === reassignTo) return null;
  if (!list.some(c => c.value === value)) return null;
  if (!list.some(c => c.value === reassignTo)) return null;
  let order = items
    .filter(it => it[field] === reassignTo)
    .reduce((m, it) => Math.max(m, it.order), 0);
  const nextItems = items.map(it => {
    if (it[field] !== value) return it;
    order += 1;
    return { ...it, [field]: reassignTo, order };
  });
  const nextCategories = list.filter(c => c.value !== value);
  return { categories: nextCategories, items: nextItems };
}
```

- [ ] **Step 4: Create the type declarations**

Create `src/components/wa-copy/lib/categoryOps.d.ts`:

```ts
export interface MutableCategory {
  value: string;
  label: string;
  iconName: string;
  tip: string;
  order: number;
}

export interface CategoryDraftInput {
  label: string;
  iconName: string;
  tip: string;
}

export function slugifyCategory(label: string): string;
export function uniqueCategoryValue(base: string, taken: Iterable<string>): string;
export function appendCategory<T extends MutableCategory>(list: T[], draft: CategoryDraftInput): T[];
export function patchCategory<T extends MutableCategory>(
  list: T[],
  value: string,
  patch: Partial<CategoryDraftInput>,
): T[];
export function reorderCategory<T extends MutableCategory>(list: T[], value: string, dir: 'up' | 'down'): T[];
export function deleteCategoryAndReassign<C extends MutableCategory, T extends Record<string, unknown>>(
  list: C[],
  items: T[],
  field: string,
  value: string,
  reassignTo: string,
): { categories: C[]; items: T[] } | null;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/wa-copy-category-ops.test.js`
Expected: PASS — all 8 tests ok.

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc -p tsconfig.json --noEmit   # exit 0
git add src/components/wa-copy/lib/categoryOps.js src/components/wa-copy/lib/categoryOps.d.ts tests/wa-copy-category-ops.test.js
git commit -m "feat(konten): pure category ops (slug/append/patch/reorder/delete+reassign)"
```

---

### Task 2: Category icon registry

**Files:**
- Create: `src/components/wa-copy/lib/categoryIcons.ts`
- Test: extend `tests/wa-copy-category-ops.test.js` is NOT used; verification is via `tsc` + the source-string test below in Task 9. Add a focused source check now.

- [ ] **Step 1: Implement the registry**

Create `src/components/wa-copy/lib/categoryIcons.ts`. It MUST include every icon the current seeds use (`Heart, Hourglass, Wallet, Quote, ShieldCheck, Lightbulb, HelpCircle, CreditCard, FileText, Plane, BedDouble, ListChecks, Compass, Home`) plus extras for choice, and a `Tag` fallback:

```ts
import type { ElementType } from 'react';
import {
  Heart, Hourglass, Wallet, Quote, ShieldCheck, Lightbulb,
  HelpCircle, CreditCard, FileText, Plane, BedDouble,
  ListChecks, Compass, Home,
  Tag, Star, Gift, Sparkles, Award, Users, Clock, MapPin,
  Phone, MessageCircle, Calendar, Camera, BookOpen, Coffee,
  Sun, Moon, Bell, CheckCircle,
} from 'lucide-react';

/** Curated icons offered in the category icon picker. Names are the lucide export names. */
export const CATEGORY_ICON_OPTIONS: { name: string; icon: ElementType }[] = [
  { name: 'Heart', icon: Heart },
  { name: 'Hourglass', icon: Hourglass },
  { name: 'Wallet', icon: Wallet },
  { name: 'Quote', icon: Quote },
  { name: 'ShieldCheck', icon: ShieldCheck },
  { name: 'Lightbulb', icon: Lightbulb },
  { name: 'HelpCircle', icon: HelpCircle },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'FileText', icon: FileText },
  { name: 'Plane', icon: Plane },
  { name: 'BedDouble', icon: BedDouble },
  { name: 'ListChecks', icon: ListChecks },
  { name: 'Compass', icon: Compass },
  { name: 'Home', icon: Home },
  { name: 'Tag', icon: Tag },
  { name: 'Star', icon: Star },
  { name: 'Gift', icon: Gift },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Award', icon: Award },
  { name: 'Users', icon: Users },
  { name: 'Clock', icon: Clock },
  { name: 'MapPin', icon: MapPin },
  { name: 'Phone', icon: Phone },
  { name: 'MessageCircle', icon: MessageCircle },
  { name: 'Calendar', icon: Calendar },
  { name: 'Camera', icon: Camera },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Coffee', icon: Coffee },
  { name: 'Sun', icon: Sun },
  { name: 'Moon', icon: Moon },
  { name: 'Bell', icon: Bell },
  { name: 'CheckCircle', icon: CheckCircle },
];

const ICON_BY_NAME: Record<string, ElementType> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map(o => [o.name, o.icon]),
);

/** Resolve an iconName to its lucide component, defaulting to Tag for unknown names. */
export function resolveCategoryIcon(name: string): ElementType {
  return ICON_BY_NAME[name] ?? Tag;
}
```

- [ ] **Step 2: Add a source-string guard test**

Create `tests/wa-copy-category-manager.test.js` (this file will gain more assertions in Tasks 7 & 9; start it here):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(rootPath, p), 'utf8');

test('icon registry exposes options + a Tag-defaulting resolver and covers seed icons', () => {
  const icons = read('src/components/wa-copy/lib/categoryIcons.ts');
  assert.match(icons, /export const CATEGORY_ICON_OPTIONS/);
  assert.match(icons, /export function resolveCategoryIcon\(name: string\): ElementType/);
  assert.match(icons, /\?\? Tag/); // fallback
  for (const name of ['Heart', 'Hourglass', 'Wallet', 'Quote', 'ShieldCheck', 'Lightbulb',
    'HelpCircle', 'CreditCard', 'FileText', 'Plane', 'BedDouble', 'ListChecks', 'Compass', 'Home']) {
    assert.match(icons, new RegExp(`name: '${name}'`), `registry missing seed icon ${name}`);
  }
});
```

- [ ] **Step 3: Run the test + type-check**

Run: `node --test tests/wa-copy-category-manager.test.js`
Expected: PASS (1 test).
Run: `npx tsc -p tsconfig.json --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/wa-copy/lib/categoryIcons.ts tests/wa-copy-category-manager.test.js
git commit -m "feat(konten): curated lucide icon registry + resolveCategoryIcon"
```

---

### Task 3: Data model — relax unions, add iconName + order (keep icon optional)

**Files:**
- Modify: `src/components/wa-copy/lib/types.ts`
- Modify: `src/components/wa-copy/lib/captions.ts`
- Modify: `src/components/wa-copy/lib/faq.ts`
- Modify: `src/components/wa-copy/lib/tourleader.ts`

This task is **additive** (it does not remove `icon`), so all current consumers keep compiling.

- [ ] **Step 1: Edit `types.ts`**

Replace the union type definitions (lines 9–24) with `string` aliases:

```ts
export type CaptionCategory = string;
export type FaqCategory = string;
export type TourPhase = string;
```

Replace the `CategoryMeta` interface (lines 82–88) and add `CategoryDraft`:

```ts
// ── Category / phase display metadata ───────────────────────────────
export interface CategoryMeta<T extends string = string> {
  value: T;
  label: string;
  iconName: string;
  /** @deprecated transitional — removed in the icon-migration cleanup task. */
  icon?: ElementType;
  tip: string;
  order: number;
}

export interface CategoryDraft {
  label: string;
  iconName: string;
  tip: string;
}
```

(`ElementType` is already imported at the top of the file — keep that import for now.)

- [ ] **Step 2: Edit `captions.ts` — add `iconName` + `order` to each entry**

Keep the lucide import and `icon:` for now; add `iconName` + `order`. Replace the `CAPTION_CATEGORIES` array:

```ts
export const CAPTION_CATEGORIES: CategoryMeta<CaptionCategory>[] = [
  { value: 'sentuhan_hati', label: 'Sentuhan Hati', icon: Heart, iconName: 'Heart', order: 1, tip: 'Sentuh emosi & kerinduan ke Baitullah. Cocok untuk audiens yang sudah lama berniat.' },
  { value: 'mumpung_sempat', label: 'Mumpung Sempat', icon: Hourglass, iconName: 'Hourglass', order: 2, tip: 'Dorong urgensi tanpa menekan — selagi sehat, sempat, dan ada rezeki.' },
  { value: 'ringan_kantong', label: 'Ringan di Kantong', icon: Wallet, iconName: 'Wallet', order: 3, tip: 'Angkat sisi keterjangkauan & kemudahan cicilan. Pakai token {harga} agar akurat.' },
  { value: 'kata_jamaah', label: 'Kata Jamaah', icon: Quote, iconName: 'Quote', order: 4, tip: 'Bangun kepercayaan lewat kesan jamaah. Hindari klaim angka yang berlebihan.' },
  { value: 'aman_tepercaya', label: 'Aman & Tepercaya', icon: ShieldCheck, iconName: 'ShieldCheck', order: 5, tip: 'Tekankan legalitas, transparansi, dan pendampingan. Tutup dengan ajakan bertanya.' },
  { value: 'tips_info', label: 'Tips & Info', icon: Lightbulb, iconName: 'Lightbulb', order: 6, tip: 'Beri nilai dulu (tips/checklist), baru ajak konsultasi. Ringan dibagikan ulang.' },
];
```

- [ ] **Step 3: Edit `faq.ts` — add `iconName` + `order`**

```ts
export const FAQ_CATEGORIES: CategoryMeta<FaqCategory>[] = [
  { value: 'umum', label: 'Umum', icon: HelpCircle, iconName: 'HelpCircle', order: 1, tip: 'Pertanyaan dasar calon jamaah.' },
  { value: 'pembayaran', label: 'Pembayaran', icon: CreditCard, iconName: 'CreditCard', order: 2, tip: 'Cara bayar, DP, dan pelunasan.' },
  { value: 'dokumen', label: 'Dokumen', icon: FileText, iconName: 'FileText', order: 3, tip: 'Paspor dan berkas wajib.' },
  { value: 'keberangkatan', label: 'Keberangkatan', icon: Plane, iconName: 'Plane', order: 4, tip: 'Manasik, bagasi, dan titik kumpul.' },
  { value: 'fasilitas', label: 'Fasilitas', icon: BedDouble, iconName: 'BedDouble', order: 5, tip: 'Hotel, makan, dan yang termasuk paket.' },
];
```

- [ ] **Step 4: Edit `tourleader.ts` — add `iconName` + `order`**

```ts
export const TOUR_PHASES: CategoryMeta<TourPhase>[] = [
  { value: 'sebelum', label: 'Sebelum', icon: ListChecks, iconName: 'ListChecks', order: 1, tip: 'Persiapan & briefing sebelum keberangkatan.' },
  { value: 'saat', label: 'Saat', icon: Compass, iconName: 'Compass', order: 2, tip: 'Pendampingan selama perjalanan & ibadah.' },
  { value: 'setelah', label: 'Setelah', icon: Home, iconName: 'Home', order: 3, tip: 'Kepulangan & menjaga silaturahmi.' },
];
```

- [ ] **Step 5: Type-check + full wa-copy tests (no behavior change)**

Run: `npx tsc -p tsconfig.json --noEmit`  → exit 0.
Run: `node --test tests/wa-copy-*.test.js` → same baseline (only faq-compact #1/#3 fail; everything else passes).

- [ ] **Step 6: Commit**

```bash
git add src/components/wa-copy/lib/types.ts src/components/wa-copy/lib/captions.ts src/components/wa-copy/lib/faq.ts src/components/wa-copy/lib/tourleader.ts
git commit -m "feat(konten): relax category unions to string; add iconName + order to category metadata"
```

---

### Task 4: Hook exposes live category slices (read-only)

**Files:**
- Modify: `src/components/wa-copy/hooks/useWaCopyContent.ts`

- [ ] **Step 1: Import seeds + types and seed the store**

At the top, add the category-seed imports and a `CategoryMeta` type import:

```ts
import { CAPTION_SEED, CAPTION_CATEGORIES } from '../lib/captions';
import { WA_COPY_FAQ_SEED, FAQ_CATEGORIES } from '../lib/faq';
import { TOUR_SEED, TOUR_PHASES } from '../lib/tourleader';
import type { AgentFaqEntry, CaptionEntry, CategoryMeta, TourStep } from '../lib/types';
```

Extend the `store` object literal to include sorted category slices:

```ts
const store = {
  captions: CAPTION_SEED.map(c => ({ ...c })) as CaptionEntry[],
  faqs: WA_COPY_FAQ_SEED.map(f => ({ ...f })) as AgentFaqEntry[],
  tourSteps: TOUR_SEED.map(t => ({ ...t })) as TourStep[],
  captionCategories: CAPTION_CATEGORIES.map(c => ({ ...c })).sort((a, b) => a.order - b.order) as CategoryMeta[],
  faqCategories: FAQ_CATEGORIES.map(c => ({ ...c })).sort((a, b) => a.order - b.order) as CategoryMeta[],
  tourPhases: TOUR_PHASES.map(c => ({ ...c })).sort((a, b) => a.order - b.order) as CategoryMeta[],
};
```

- [ ] **Step 2: Add the slices to the interface + return**

In `UseWaCopyContent` (after `tourSteps: TourStep[];`) add:

```ts
  captionCategories: CategoryMeta[];
  faqCategories: CategoryMeta[];
  tourPhases: CategoryMeta[];
```

In the returned object (after `tourSteps: store.tourSteps,`) add:

```ts
    captionCategories: store.captionCategories,
    faqCategories: store.faqCategories,
    tourPhases: store.tourPhases,
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc -p tsconfig.json --noEmit` → exit 0.
Run: `node --test tests/wa-copy-*.test.js` → baseline unchanged.

```bash
git add src/components/wa-copy/hooks/useWaCopyContent.ts
git commit -m "feat(konten): expose live category slices from useWaCopyContent store"
```

---

### Task 5: Migrate all consumers to read categories from the hook

Switch every category consumer off the static metadata import and onto the hook's live slices + `resolveCategoryIcon`. Behavior is unchanged (same categories, same order). Editors receive categories via a new prop.

**Files:**
- Modify: `src/components/wa-copy/admin/WaCopyAdminPage.tsx`
- Modify: `src/components/wa-copy/admin/CaptionEditor.tsx`, `FaqEditor.tsx`, `TourLeaderEditor.tsx`
- Modify: `src/components/wa-copy/tabs/caption/CaptionTab.tsx`, `caption/CaptionCard.tsx`, `faq/FaqTab.tsx`, `tourleader/TourLeaderTab.tsx`

- [ ] **Step 1: `WaCopyAdminPage.tsx` — derive label/order maps from the hook**

Remove the three category-const imports (lines 6–8):

```ts
import { CAPTION_CATEGORIES } from '../lib/captions';
import { FAQ_CATEGORIES } from '../lib/faq';
import { TOUR_PHASES } from '../lib/tourleader';
```

Delete the module-level derived constants (lines 21–26: `CAPTION_LABEL`, `FAQ_LABEL`, `PHASE_LABEL`, `CAPTION_ORDER`, `FAQ_ORDER`, `PHASE_ORDER`). Re-derive them **inside** the component from `content`, right after `const content = useWaCopyContent();`:

```ts
  const sortByOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
  const captionCats = [...content.captionCategories].sort(sortByOrder);
  const faqCats = [...content.faqCategories].sort(sortByOrder);
  const phaseCats = [...content.tourPhases].sort(sortByOrder);
  const CAPTION_LABEL: Record<string, string> = Object.fromEntries(captionCats.map(c => [c.value, c.label]));
  const FAQ_LABEL: Record<string, string> = Object.fromEntries(faqCats.map(c => [c.value, c.label]));
  const PHASE_LABEL: Record<string, string> = Object.fromEntries(phaseCats.map(c => [c.value, c.label]));
  const CAPTION_ORDER = captionCats.map(c => c.value);
  const FAQ_ORDER = faqCats.map(c => c.value);
  const PHASE_ORDER = phaseCats.map(c => c.value);
```

Pass categories to the editors. In the caption editor branch, change `<CaptionEditor initial={initial} ...>` to also pass `categories={content.captionCategories}`; similarly `<FaqEditor ... categories={content.faqCategories}>` and `<TourLeaderEditor ... categories={content.tourPhases}>`.

- [ ] **Step 2: `CaptionEditor.tsx` — categories via prop**

Remove `import { CAPTION_CATEGORIES } from '../lib/captions';`. Add `CategoryMeta` to the type import: `import type { CaptionCategory, CaptionEntry, CategoryMeta } from '../lib/types';`. Extend props and use them:

```ts
interface CaptionEditorProps {
  initial?: CaptionEntry;
  categories: CategoryMeta[];
  onSave: (draft: CaptionDraft) => void;
  onCancel: () => void;
}

export default function CaptionEditor({ initial, categories, onSave, onCancel }: CaptionEditorProps) {
  // ...
  const [category, setCategory] = useState<CaptionCategory>(initial?.category ?? categories[0]?.value ?? '');
```

In the `<select>`, map `categories` instead of `CAPTION_CATEGORIES`:

```tsx
          {categories.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
```

- [ ] **Step 3: `FaqEditor.tsx` — categories via prop**

Remove `import { FAQ_CATEGORIES } from '../lib/faq';`. Change type import to `import type { AgentFaqEntry, CategoryMeta, FaqCategory } from '../lib/types';`. Extend props:

```ts
interface FaqEditorProps {
  initial?: AgentFaqEntry;
  categories: CategoryMeta[];
  onSave: (draft: FaqDraft) => void;
  onCancel: () => void;
}

export default function FaqEditor({ initial, categories, onSave, onCancel }: FaqEditorProps) {
  const [category, setCategory] = useState<FaqCategory>(initial?.category ?? categories[0]?.value ?? '');
```

Map `categories` in the `<select>` (replace `FAQ_CATEGORIES.map`).

- [ ] **Step 4: `TourLeaderEditor.tsx` — phases via prop**

Remove `import { TOUR_PHASES } from '../lib/tourleader';`. Change type import to `import type { CategoryMeta, TourPhase, TourStep } from '../lib/types';`. Extend props:

```ts
interface TourLeaderEditorProps {
  initial?: TourStep;
  categories: CategoryMeta[];
  onSave: (draft: TourDraft) => void;
  onCancel: () => void;
}

export default function TourLeaderEditor({ initial, categories, onSave, onCancel }: TourLeaderEditorProps) {
  const [phase, setPhase] = useState<TourPhase>(initial?.phase ?? categories[0]?.value ?? '');
```

Map `categories` in the `<select>` (replace `TOUR_PHASES.map`).

- [ ] **Step 5: `CaptionTab.tsx` — categories from hook, resolved active, resolved icons**

Replace the `CAPTION_CATEGORIES` import with `import { resolveCategoryIcon } from '../../lib/categoryIcons';`. Pull categories from the hook and resolve a safe active category:

```tsx
  const { captions, captionCategories } = useWaCopyContent();
  // ...
  const categories = [...captionCategories].sort((a, b) => a.order - b.order);
  const [activeCategory, setActiveCategory] = useState<CaptionCategory>('');
  const resolvedCategory = categories.some(c => c.value === activeCategory)
    ? activeCategory
    : (categories[0]?.value ?? '');

  const activeMeta = categories.find(c => c.value === resolvedCategory) ?? categories[0];
  const labelOf = (value: string) => categories.find(c => c.value === value)?.label ?? value;
  const visible = captions
    .filter(c => c.active && c.category === resolvedCategory)
    .sort((a, b) => a.order - b.order);

  const firstNonEmpty = categories.find(c =>
    captions.some(cap => cap.active && cap.category === c.value),
  );
```

Update the chips and the tip and the empty-state button to use `resolvedCategory`/`categories`:

```tsx
      <CategoryChips
        options={categories.map(c => ({ value: c.value, label: c.label, icon: resolveCategoryIcon(c.iconName) }))}
        value={resolvedCategory}
        onChange={setActiveCategory}
      />
      <p className="...">{activeMeta?.tip}</p>
```

(The empty-state "Lihat Semua Kategori" button keeps comparing `firstNonEmpty.value !== resolvedCategory`.) In the `visible.map`, pass the label to the card: `<CaptionCard key={entry.id} entry={entry} categoryLabel={labelOf(entry.category)} agentCtx={agentCtx} pkgCtx={pkg.selectedCtx} showToast={showToast} />`.

- [ ] **Step 6: `CaptionCard.tsx` — label via prop**

Remove `import { CAPTION_CATEGORIES } from '../../lib/captions';` and the `CATEGORY_LABEL` const. Add `categoryLabel: string;` to `CaptionCardProps`, destructure it, and replace `{CATEGORY_LABEL[entry.category]}` with `{categoryLabel}`.

- [ ] **Step 7: `FaqTab.tsx` — categories from hook**

Replace the `FAQ_CATEGORIES` import with `import { resolveCategoryIcon } from '../../lib/categoryIcons';`. Use live categories:

```tsx
  const { faqs, faqCategories } = useWaCopyContent();
  const categories = [...faqCategories].sort((a, b) => a.order - b.order);
  const catIndex = (c: FaqCategory) => categories.findIndex(x => x.value === c);
  // ...
  const resolved: FaqFilter =
    activeCategory === 'all' || categories.some(c => c.value === activeCategory) ? activeCategory : 'all';
  const visible = faqs
    .filter(f => f.active)
    .filter(f => resolved === 'all' || f.category === resolved)
    .filter(f => !q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q))
    .sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.order - b.order);

  const chipOptions = [
    { value: 'all' as FaqFilter, label: 'Semua', icon: LayoutGrid },
    ...categories.map(c => ({ value: c.value as FaqFilter, label: c.label, icon: resolveCategoryIcon(c.iconName) })),
  ];
```

Set the chips `value={resolved}`.

- [ ] **Step 8: `TourLeaderTab.tsx` — phases from hook**

Replace the `TOUR_PHASES` import with `import { resolveCategoryIcon } from '../../lib/categoryIcons';`. Use live phases:

```tsx
  const { tourSteps, tourPhases } = useWaCopyContent();
  const phases = [...tourPhases].sort((a, b) => a.order - b.order);
  const [activePhase, setActivePhase] = useState<TourPhase>('');
  const resolvedPhase = phases.some(p => p.value === activePhase) ? activePhase : (phases[0]?.value ?? '');
  const meta = phases.find(p => p.value === resolvedPhase) ?? phases[0];
  const visible = tourSteps
    .filter(t => t.active && t.phase === resolvedPhase)
    .sort((a, b) => a.order - b.order);
```

Update chips: `options={phases.map(p => ({ value: p.value, label: p.label, icon: resolveCategoryIcon(p.iconName) }))}` and `value={resolvedPhase}`; tip uses `{meta?.tip}`.

- [ ] **Step 9: Type-check + full tests + build**

Run: `npx tsc -p tsconfig.json --noEmit` → exit 0.
Run: `node --test tests/wa-copy-*.test.js` → baseline unchanged (faq-compact #1/#3 still the only failures; #8 still passes).
Run: `npm run build` → succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/components/wa-copy/admin/WaCopyAdminPage.tsx src/components/wa-copy/admin/CaptionEditor.tsx src/components/wa-copy/admin/FaqEditor.tsx src/components/wa-copy/admin/TourLeaderEditor.tsx src/components/wa-copy/tabs/caption/CaptionTab.tsx src/components/wa-copy/tabs/caption/CaptionCard.tsx src/components/wa-copy/tabs/faq/FaqTab.tsx src/components/wa-copy/tabs/tourleader/TourLeaderTab.tsx
git commit -m "refactor(konten): source categories from the store hook (behavior-preserving)"
```

---

### Task 6: Drop the transitional `icon` field

Now that no consumer reads `.icon`, remove it from the model and the seeds.

**Files:**
- Modify: `src/components/wa-copy/lib/types.ts`, `captions.ts`, `faq.ts`, `tourleader.ts`

- [ ] **Step 1: Remove `icon` from `CategoryMeta`**

In `types.ts`, delete the deprecated line from `CategoryMeta`:

```ts
  /** @deprecated transitional — removed in the icon-migration cleanup task. */
  icon?: ElementType;
```

If `ElementType` is no longer referenced in `types.ts` after this, remove its import (`import type { ElementType } from 'react';`). (Check first — at the time of writing it is only used by `CategoryMeta.icon`.)

- [ ] **Step 2: Remove `icon:` from the three seed files + unused lucide imports**

In `captions.ts`, delete every `icon: <Component>,` from `CAPTION_CATEGORIES` and remove the now-unused lucide import line (`import { Heart, Hourglass, ... } from 'lucide-react';`). Do the same in `faq.ts` and `tourleader.ts`. Each entry becomes e.g.:

```ts
  { value: 'sentuhan_hati', label: 'Sentuhan Hati', iconName: 'Heart', order: 1, tip: '…' },
```

- [ ] **Step 3: Type-check + tests + build + commit**

Run: `npx tsc -p tsconfig.json --noEmit` → exit 0.
Run: `node --test tests/wa-copy-*.test.js` → baseline unchanged.
Run: `npm run build` → succeeds.

```bash
git add src/components/wa-copy/lib/types.ts src/components/wa-copy/lib/captions.ts src/components/wa-copy/lib/faq.ts src/components/wa-copy/lib/tourleader.ts
git commit -m "refactor(konten): drop transitional icon component field from category metadata"
```

---

### Task 7: Category CRUD mutations in the hook

**Files:**
- Modify: `src/components/wa-copy/hooks/useWaCopyContent.ts`
- Test: extend `tests/wa-copy-category-manager.test.js`

- [ ] **Step 1: Write the failing source-string assertions**

Append to `tests/wa-copy-category-manager.test.js`:

```js
test('hook exposes category CRUD wired to categoryOps with reassign-on-delete', () => {
  const hook = read('src/components/wa-copy/hooks/useWaCopyContent.ts');
  // imports
  assert.match(hook, /from '\.\.\/lib\/categoryOps'/);
  // create/update/reorder/delete for each kind
  for (const fn of [
    'createCaptionCategory', 'updateCaptionCategory', 'reorderCaptionCategory', 'deleteCaptionCategory',
    'createFaqCategory', 'updateFaqCategory', 'reorderFaqCategory', 'deleteFaqCategory',
    'createTourCategory', 'updateTourCategory', 'reorderTourCategory', 'deleteTourCategory',
  ]) {
    assert.match(hook, new RegExp(`function ${fn}\\b`), `missing ${fn}`);
    assert.match(hook, new RegExp(`${fn},`), `${fn} not returned`);
  }
  // delete reassigns content via the right field and bails on null
  assert.match(hook, /deleteCategoryAndReassign\(store\.captionCategories, store\.captions, 'category'/);
  assert.match(hook, /deleteCategoryAndReassign\(store\.faqCategories, store\.faqs, 'category'/);
  assert.match(hook, /deleteCategoryAndReassign\(store\.tourPhases, store\.tourSteps, 'phase'/);
  assert.match(hook, /if \(!res\) return;/);
});
```

Run: `node --test tests/wa-copy-category-manager.test.js`
Expected: FAIL (functions not present yet).

- [ ] **Step 2: Implement the mutations**

In `useWaCopyContent.ts`, add the ops import near the other lib imports:

```ts
import {
  appendCategory,
  patchCategory,
  reorderCategory,
  deleteCategoryAndReassign,
} from '../lib/categoryOps';
import type { AgentFaqEntry, CaptionEntry, CategoryDraft, CategoryMeta, TourStep } from '../lib/types';
```

Add a category-mutations block after the Tour Leader mutations (before the `UseWaCopyContent` interface):

```ts
// ── Category mutations ──────────────────────────────────────────────
function createCaptionCategory(draft: CategoryDraft): void {
  store.captionCategories = appendCategory(store.captionCategories, draft);
  emit();
}
function updateCaptionCategory(value: string, patch: Partial<CategoryDraft>): void {
  store.captionCategories = patchCategory(store.captionCategories, value, patch);
  emit();
}
function reorderCaptionCategory(value: string, dir: 'up' | 'down'): void {
  store.captionCategories = reorderCategory(store.captionCategories, value, dir);
  emit();
}
function deleteCaptionCategory(value: string, reassignTo: string): void {
  const res = deleteCategoryAndReassign(store.captionCategories, store.captions, 'category', value, reassignTo);
  if (!res) return;
  store.captionCategories = res.categories;
  store.captions = res.items;
  emit();
}

function createFaqCategory(draft: CategoryDraft): void {
  store.faqCategories = appendCategory(store.faqCategories, draft);
  emit();
}
function updateFaqCategory(value: string, patch: Partial<CategoryDraft>): void {
  store.faqCategories = patchCategory(store.faqCategories, value, patch);
  emit();
}
function reorderFaqCategory(value: string, dir: 'up' | 'down'): void {
  store.faqCategories = reorderCategory(store.faqCategories, value, dir);
  emit();
}
function deleteFaqCategory(value: string, reassignTo: string): void {
  const res = deleteCategoryAndReassign(store.faqCategories, store.faqs, 'category', value, reassignTo);
  if (!res) return;
  store.faqCategories = res.categories;
  store.faqs = res.items;
  emit();
}

function createTourCategory(draft: CategoryDraft): void {
  store.tourPhases = appendCategory(store.tourPhases, draft);
  emit();
}
function updateTourCategory(value: string, patch: Partial<CategoryDraft>): void {
  store.tourPhases = patchCategory(store.tourPhases, value, patch);
  emit();
}
function reorderTourCategory(value: string, dir: 'up' | 'down'): void {
  store.tourPhases = reorderCategory(store.tourPhases, value, dir);
  emit();
}
function deleteTourCategory(value: string, reassignTo: string): void {
  const res = deleteCategoryAndReassign(store.tourPhases, store.tourSteps, 'phase', value, reassignTo);
  if (!res) return;
  store.tourPhases = res.categories;
  store.tourSteps = res.items;
  emit();
}
```

Extend the `UseWaCopyContent` interface (after the `tourPhases: CategoryMeta[];` line added in Task 4):

```ts
  createCaptionCategory: typeof createCaptionCategory;
  updateCaptionCategory: typeof updateCaptionCategory;
  reorderCaptionCategory: typeof reorderCaptionCategory;
  deleteCaptionCategory: typeof deleteCaptionCategory;
  createFaqCategory: typeof createFaqCategory;
  updateFaqCategory: typeof updateFaqCategory;
  reorderFaqCategory: typeof reorderFaqCategory;
  deleteFaqCategory: typeof deleteFaqCategory;
  createTourCategory: typeof createTourCategory;
  updateTourCategory: typeof updateTourCategory;
  reorderTourCategory: typeof reorderTourCategory;
  deleteTourCategory: typeof deleteTourCategory;
```

Add the same twelve names to the returned object (after `tourPhases: store.tourPhases,`):

```ts
    createCaptionCategory,
    updateCaptionCategory,
    reorderCaptionCategory,
    deleteCaptionCategory,
    createFaqCategory,
    updateFaqCategory,
    reorderFaqCategory,
    deleteFaqCategory,
    createTourCategory,
    updateTourCategory,
    reorderTourCategory,
    deleteTourCategory,
```

- [ ] **Step 3: Run tests + type-check**

Run: `node --test tests/wa-copy-category-manager.test.js` → PASS.
Run: `node --test tests/wa-copy-category-ops.test.js` → still PASS.
Run: `npx tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/wa-copy/hooks/useWaCopyContent.ts tests/wa-copy-category-manager.test.js
git commit -m "feat(konten): category create/update/reorder/delete+reassign mutations in store hook"
```

---

### Task 8: IconPicker + CategoryEditor components

**Files:**
- Create: `src/components/wa-copy/admin/IconPicker.tsx`
- Create: `src/components/wa-copy/admin/CategoryEditor.tsx`

- [ ] **Step 1: Implement `IconPicker.tsx`**

```tsx
import { CATEGORY_ICON_OPTIONS } from '../lib/categoryIcons';

interface IconPickerProps {
  value: string;
  onChange: (name: string) => void;
}

/** Grid of curated lucide icons; the selected one is highlighted. */
export default function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {CATEGORY_ICON_OPTIONS.map(({ name, icon: Icon }) => {
        const active = name === value;
        return (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={active}
            onClick={() => onChange(name)}
            className={`aspect-square flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
              active
                ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement `CategoryEditor.tsx`**

```tsx
import { useState } from 'react';
import { CATEGORY_ICON_OPTIONS } from '../lib/categoryIcons';
import type { CategoryDraft, CategoryMeta } from '../lib/types';
import IconPicker from './IconPicker';

interface CategoryEditorProps {
  unitLabel: string; // "Kategori" | "Fase"
  initial?: CategoryMeta;
  onSave: (draft: CategoryDraft) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

export default function CategoryEditor({ unitLabel, initial, onSave, onCancel }: CategoryEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [iconName, setIconName] = useState(initial?.iconName ?? CATEGORY_ICON_OPTIONS[0].name);
  const [tip, setTip] = useState(initial?.tip ?? '');

  const canSave = label.trim().length > 0;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ label: label.trim(), iconName, tip: tip.trim() });
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div>
        <label className={LABEL_CLASS}>Nama {unitLabel}</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={`Mis. ${unitLabel} Baru`}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Ikon</label>
        <IconPicker value={iconName} onChange={setIconName} />
      </div>

      <div>
        <label className={LABEL_CLASS}>Tip (opsional)</label>
        <input
          type="text"
          value={tip}
          onChange={e => setTip(e.target.value)}
          placeholder="Penjelasan singkat untuk agent…"
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 active:scale-95 transition-all"
        >
          Batal
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
        >
          Simpan
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc -p tsconfig.json --noEmit` → exit 0.

```bash
git add src/components/wa-copy/admin/IconPicker.tsx src/components/wa-copy/admin/CategoryEditor.tsx
git commit -m "feat(konten): IconPicker + CategoryEditor form components"
```

---

### Task 9: DeleteCategoryPanel + CategoryManager view

**Files:**
- Create: `src/components/wa-copy/admin/DeleteCategoryPanel.tsx`
- Create: `src/components/wa-copy/admin/CategoryManager.tsx`
- Test: extend `tests/wa-copy-category-manager.test.js`

- [ ] **Step 1: Write the failing source-string assertions**

Append to `tests/wa-copy-category-manager.test.js`:

```js
test('CategoryManager wires the store, icons, counts, reorder, and reassign-delete', () => {
  const mgr = read('src/components/wa-copy/admin/CategoryManager.tsx');
  assert.match(mgr, /useWaCopyContent\(\)/);
  assert.match(mgr, /resolveCategoryIcon/);
  assert.match(mgr, /konten/);                 // per-category count label
  assert.match(mgr, /DeleteCategoryPanel/);    // delete delegates to reassign panel
  assert.match(mgr, /CategoryEditor/);         // create/edit delegates to the form
  assert.match(mgr, /onExit/);                 // returns to the content list
  assert.match(mgr, /backRequest/);            // handles parent back requests
});

test('DeleteCategoryPanel reassigns to another category and blocks when none remain', () => {
  const panel = read('src/components/wa-copy/admin/DeleteCategoryPanel.tsx');
  assert.match(panel, /Pindahkan/);
  assert.match(panel, /others/);
  assert.match(panel, /onConfirm\(reassignTo\)/);
});
```

Run: `node --test tests/wa-copy-category-manager.test.js` → the two new tests FAIL.

- [ ] **Step 2: Implement `DeleteCategoryPanel.tsx`**

```tsx
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CategoryMeta } from '../lib/types';

interface DeleteCategoryPanelProps {
  unitLabel: string;
  category: CategoryMeta;
  others: CategoryMeta[];
  count: number;
  onConfirm: (reassignTo: string) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

export default function DeleteCategoryPanel({
  unitLabel,
  category,
  others,
  count,
  onConfirm,
  onCancel,
}: DeleteCategoryPanelProps) {
  const [reassignTo, setReassignTo] = useState(others[0]?.value ?? '');
  const canDelete = others.length > 0 && reassignTo.length > 0;

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-900/15 p-3">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          Hapus {unitLabel.toLowerCase()} <strong>{category.label}</strong>
          {count > 0 ? ` — ${count} konten akan dipindahkan.` : ' — tidak ada konten di dalamnya.'}
        </p>
      </div>

      {others.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Tidak bisa dihapus: ini satu-satunya {unitLabel.toLowerCase()}. Buat {unitLabel.toLowerCase()} lain dulu.
        </p>
      ) : (
        <div>
          <label className={LABEL_CLASS}>Pindahkan konten ke</label>
          <select value={reassignTo} onChange={e => setReassignTo(e.target.value)} className={INPUT_CLASS}>
            {others.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 active:scale-95 transition-all"
        >
          Batal
        </button>
        <button
          onClick={() => canDelete && onConfirm(reassignTo)}
          disabled={!canDelete}
          className="flex-1 py-3 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
        >
          Hapus &amp; Pindahkan
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `CategoryManager.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWaCopyContent } from '../hooks/useWaCopyContent';
import { useToast, ToastPill } from '../hooks/useToast';
import { resolveCategoryIcon } from '../lib/categoryIcons';
import type { CategoryDraft, CategoryMeta, WaTab } from '../lib/types';
import CategoryEditor from './CategoryEditor';
import DeleteCategoryPanel from './DeleteCategoryPanel';

interface CategoryManagerProps {
  kind: WaTab;
  backRequest: number;
  onExit: () => void;
}

type SubView = { mode: 'list' } | { mode: 'edit'; value: string | null } | { mode: 'delete'; value: string };

export default function CategoryManager({ kind, backRequest, onExit }: CategoryManagerProps) {
  const content = useWaCopyContent();
  const { toast, showToast } = useToast();

  const cfg = {
    caption: {
      title: 'Kategori Caption',
      unit: 'Kategori',
      categories: content.captionCategories,
      countOf: (value: string) => content.captions.filter(c => c.category === value).length,
      create: content.createCaptionCategory,
      update: content.updateCaptionCategory,
      reorder: content.reorderCaptionCategory,
      remove: content.deleteCaptionCategory,
    },
    faq: {
      title: 'Kategori FAQ',
      unit: 'Kategori',
      categories: content.faqCategories,
      countOf: (value: string) => content.faqs.filter(f => f.category === value).length,
      create: content.createFaqCategory,
      update: content.updateFaqCategory,
      reorder: content.reorderFaqCategory,
      remove: content.deleteFaqCategory,
    },
    tourleader: {
      title: 'Fase Tour Leader',
      unit: 'Fase',
      categories: content.tourPhases,
      countOf: (value: string) => content.tourSteps.filter(t => t.phase === value).length,
      create: content.createTourCategory,
      update: content.updateTourCategory,
      reorder: content.reorderTourCategory,
      remove: content.deleteTourCategory,
    },
  }[kind];

  const categories: CategoryMeta[] = [...cfg.categories].sort((a, b) => a.order - b.order);

  const [sub, setSub] = useState<SubView>({ mode: 'list' });
  const subRef = useRef(sub);
  subRef.current = sub;

  // Parent back button: step out of a sub-view, or leave the manager from the list.
  useEffect(() => {
    if (!backRequest) return;
    if (subRef.current.mode === 'list') onExit();
    else setSub({ mode: 'list' });
  }, [backRequest, onExit]);

  // ── Edit / create sub-view ────────────────────────────────────────
  if (sub.mode === 'edit') {
    const initial = sub.value ? categories.find(c => c.value === sub.value) : undefined;
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <CategoryEditor
          unitLabel={cfg.unit}
          initial={initial}
          onCancel={() => setSub({ mode: 'list' })}
          onSave={(draft: CategoryDraft) => {
            if (sub.value) cfg.update(sub.value, draft);
            else cfg.create(draft);
            showToast(`${cfg.unit} tersimpan`);
            setSub({ mode: 'list' });
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── Delete + reassign sub-view ────────────────────────────────────
  if (sub.mode === 'delete') {
    const category = categories.find(c => c.value === sub.value);
    if (!category) {
      setSub({ mode: 'list' });
      return null;
    }
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <DeleteCategoryPanel
          unitLabel={cfg.unit}
          category={category}
          others={categories.filter(c => c.value !== category.value)}
          count={cfg.countOf(category.value)}
          onCancel={() => setSub({ mode: 'list' })}
          onConfirm={reassignTo => {
            cfg.remove(category.value, reassignTo);
            showToast(`${cfg.unit} dihapus`);
            setSub({ mode: 'list' });
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  const canDelete = categories.length > 1;

  return (
    <div className="px-4 pt-4 pb-8 space-y-4" style={{ paddingBottom: '2rem' }}>
      <div className="flex items-center gap-2">
        <button
          onClick={onExit}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Kembali"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-sm font-bold text-gray-800 dark:text-white">{cfg.title}</h2>
      </div>

      <button
        onClick={() => setSub({ mode: 'edit', value: null })}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
      >
        <Plus size={16} />
        Tambah {cfg.unit}
      </button>

      <div className="space-y-2">
        {categories.map((cat, idx) => {
          const Icon = resolveCategoryIcon(cat.iconName);
          const count = cfg.countOf(cat.value);
          return (
            <div
              key={cat.value}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 flex items-center gap-3"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => cfg.reorder(cat.value, 'up')}
                  disabled={idx === 0}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 dark:text-slate-600 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-slate-700 dark:hover:text-slate-400 disabled:opacity-20 transition-colors"
                  aria-label="Naik"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => cfg.reorder(cat.value, 'down')}
                  disabled={idx === categories.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 dark:text-slate-600 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-slate-700 dark:hover:text-slate-400 disabled:opacity-20 transition-colors"
                  aria-label="Turun"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <span className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
                <Icon size={16} className="text-gray-500 dark:text-slate-400" />
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{cat.label}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{count} konten</p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSub({ mode: 'edit', value: cat.value })}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setSub({ mode: 'delete', value: cat.value })}
                  disabled={!canDelete}
                  title={canDelete ? undefined : `Tidak bisa menghapus ${cfg.unit.toLowerCase()} terakhir`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                  aria-label="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ToastPill toast={toast} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests + type-check + build**

Run: `node --test tests/wa-copy-category-manager.test.js` → all PASS.
Run: `npx tsc -p tsconfig.json --noEmit` → exit 0.
Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/wa-copy/admin/DeleteCategoryPanel.tsx src/components/wa-copy/admin/CategoryManager.tsx tests/wa-copy-category-manager.test.js
git commit -m "feat(konten): CategoryManager view + DeleteCategoryPanel (reassign-on-delete)"
```

---

### Task 10: Integrate into WaCopyAdminPage + extend the back contract

**Files:**
- Modify: `src/components/wa-copy/admin/WaCopyAdminPage.tsx`
- Modify: `tests/wa-copy-admin-back.test.js`

- [ ] **Step 1: Update the back-contract test (TDD — this is an intentional contract extension)**

In `tests/wa-copy-admin-back.test.js`, the second test ("WA Copy admin page reports edit state and handles parent back requests") asserts the old open-state expression. Replace its body assertions with the combined contract and add manager assertions. The final test should read:

```js
test('WA Copy admin page reports edit state and handles parent back requests', () => {
  const admin = read('src/components/wa-copy/admin/WaCopyAdminPage.tsx');

  assert.match(admin, /interface WaCopyAdminPageProps \{[\s\S]*backRequest\?: number;[\s\S]*onEditingChange\?: \(editing: boolean\) => void;[\s\S]*\}/);
  assert.match(admin, /export default function WaCopyAdminPage\(\{ backRequest = 0, onEditingChange \}: WaCopyAdminPageProps\)/);
  // open-state now also covers the category manager
  assert.match(admin, /onEditingChange\?\.\(editing !== null \|\| managing\)/);
  assert.match(admin, /setEditing\(current => \(current \? null : current\)\)/);
  // category manager wiring
  assert.match(admin, /const \[managing, setManaging\] = useState\(false\)/);
  assert.match(admin, /<CategoryManager\s+kind=\{type\}\s+backRequest=\{backRequest\}\s+onExit=\{\(\) => setManaging\(false\)\}/);
  assert.match(admin, /Kelola Kategori/);
});
```

Run: `node --test tests/wa-copy-admin-back.test.js` → the updated test FAILS (impl not done).

- [ ] **Step 2: Wire the manager into `WaCopyAdminPage.tsx`**

Add imports at the top:

```ts
import { Plus, Settings2 } from 'lucide-react';
// ...
import CategoryManager from './CategoryManager';
```

Add the `managing` state next to `editing`:

```ts
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [managing, setManaging] = useState(false);
```

Replace the open-state effect (currently `onEditingChange?.(editing !== null)`) and the back-request effect:

```ts
  useEffect(() => {
    onEditingChange?.(editing !== null || managing);
  }, [editing, managing, onEditingChange]);

  useEffect(() => {
    return () => onEditingChange?.(false);
  }, [onEditingChange]);

  useEffect(() => {
    if (!backRequest) return;
    if (managing) return; // CategoryManager handles its own back stepping
    setEditing(current => (current ? null : current));
  }, [backRequest, managing]);
```

Add the manager view as the first early return inside the render (before the `if (editing)` block):

```tsx
  // ── Category manager view ─────────────────────────────────────────
  if (managing) {
    return <CategoryManager kind={type} backRequest={backRequest} onExit={() => setManaging(false)} />;
  }
```

Replace the single "Tambah" button with a button row that adds "Kelola Kategori":

```tsx
      <div className="flex gap-2">
        <button
          onClick={() => setEditing({ id: null })}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <Plus size={16} />
          Tambah
        </button>
        <button
          onClick={() => setManaging(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
        >
          <Settings2 size={16} />
          Kelola Kategori
        </button>
      </div>
```

- [ ] **Step 3: Run the affected tests + type-check + build**

Run: `node --test tests/wa-copy-admin-back.test.js` → PASS (both tests).
Run: `node --test tests/wa-copy-admin-tabs.test.js` → PASS (tab order, `useState<WaTab>('faq')`, no forbidden helper copy — all intact).
Run: `npx tsc -p tsconfig.json --noEmit` → exit 0.
Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/wa-copy/admin/WaCopyAdminPage.tsx tests/wa-copy-admin-back.test.js
git commit -m "feat(konten): Kelola Kategori button + manager view wired into admin page back flow"
```

---

### Task 11: Full verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Full test suite — confirm no regressions beyond the known baseline**

Run: `node --test tests/*.test.js`
Expected: the ONLY failures are the two pre-existing `wa-copy-faq-compact.test.js` cases (#1 card layout, #3 tighter actions). Everything else — including all category-ops, category-manager, admin-back, admin-tabs, content-list, non-admin-lock, and faq-compact #2 — passes. If any *other* test fails, fix it before continuing.

- [ ] **Step 2: Type-check + production build**

Run: `npx tsc -p tsconfig.json --noEmit` → exit 0.
Run: `npm run build` → succeeds with no type/bundle errors.

- [ ] **Step 3: Manual smoke (admin, `/dashboard/konten`)**

Run `npm run dev`, sign in as an admin, open Konten. For at least the Caption and Tour Leader tabs verify:
1. **Kelola Kategori** button appears next to **Tambah**; clicking opens the manager titled "Kategori Caption" / "Fase Tour Leader".
2. **Add** a category (pick an icon, name it) → it appears in the list, and in the content editor's category dropdown, and as a chip in the agent-facing tab.
3. **Edit** a category's label/icon → the badge/chip updates everywhere; existing content stays in that category (value stable).
4. **Reorder** a category up/down → group order changes in both the admin list and the agent tab.
5. **Delete** a category that has content → reassign panel lists the other categories; confirm → content moves to the target (no items lost), category disappears.
6. The **only remaining** category's delete button is disabled with a tooltip.
7. The dashboard **back** button: from a sub-view (edit/delete) returns to the manager list; from the manager list returns to the content list; from the content list leaves Konten.

- [ ] **Step 4: Final confirmation**

Confirm `git status` is clean (all tasks committed) and `git log --oneline -11` shows the eleven feature commits. Report the test/tsc/build results verbatim.

---

## Self-Review

**Spec coverage:**
- Scope = all three content types → Tasks 4–10 cover caption, faq, tourleader symmetrically. ✓
- Delete = reassign-to-another-category → `deleteCategoryAndReassign` (Task 1) + `DeleteCategoryPanel` (Task 9). ✓
- Icon = curated lucide picker → `categoryIcons.ts` + `IconPicker` (Tasks 2, 8). ✓
- Placement = per-tab "Kelola Kategori" → Task 10. ✓
- Architecture = records in `useWaCopyContent`, union→string → Tasks 3, 4, 7. ✓
- Reassign-on-delete integrity / no orphans → Task 1 tests + Task 11 smoke. ✓
- Block deleting last category → `deleteCategoryAndReassign` null guard + disabled UI (Tasks 1, 9). ✓
- Resolve-icon fallback / stable value on rename → Tasks 2, 1. ✓
- Agent tabs resilient to deleted active category → Task 5 `resolved*` derivation. ✓
- Keep `wa-copy-faq-compact` #2 + content-list + non-admin-lock green → preserved; `FaqAccordionItem` untouched. ✓
- Testing via `.js` runtime + source-string → Tasks 1, 2, 7, 9, 10. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code or exact edits. ✓

**Type consistency:** `CategoryMeta` (value/label/iconName/tip/order) ↔ `categoryOps` `MutableCategory` are structurally identical; `CategoryDraft` (types.ts) ↔ `CategoryDraftInput` (categoryOps.d.ts) identical. Hook mutation names match between the function definitions, the interface, the return object, and the Task 7 test (`create/update/reorder/deleteCaptionCategory`, `…FaqCategory`, `…TourCategory`). `resolveCategoryIcon`, `CATEGORY_ICON_OPTIONS`, `deleteCategoryAndReassign` spelled identically across tasks. ✓
