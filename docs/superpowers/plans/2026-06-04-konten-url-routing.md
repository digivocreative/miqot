# Konten URL Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every CRUD view inside `/dashboard/konten` gets its own URL (reload restores the view); the URL becomes the single source of truth and the synthetic back mechanism (`kontenBackRequest`/`kontenEditorOpen`) is deleted.

**Architecture:** A pure two-way route module (`kontenRoutes.js` + `.d.ts`, same runtime-testable pattern as `categoryOps.js`) parses/builds `/dashboard/konten/{tab}[/tambah|/edit/{id}|/kategori[...]]`. `DashboardLayout` passes the parsed route + a `navigate(path, {replace?})` + a `navigateUp()` into `WaCopyAdminPage`; all internal view state in `WaCopyAdminPage`/`CategoryManager` is replaced by route derivation. Spec: `docs/superpowers/specs/2026-06-04-konten-url-routing-design.md`.

**Tech Stack:** React 18 + Vite SPA, hand-rolled history routing in `DashboardLayout.tsx` (no router library), `node:test` for tests.

**Session constraints (apply to EVERY task):**
- A parallel session may be editing `server.js` and other files. NEVER touch `server.js`. NEVER run `git stash`, `git checkout <branch>`, `git reset`, or `git pull`.
- Before every commit: `git branch --show-current` MUST print `main`; commit ONLY the exact paths listed in the task's commit step (`git add <paths> && git commit -m ... -- <paths>`).
- There is an unrelated stash entry (`stash@{0}`) — leave it alone.

---

### Task 1: Route module `kontenRoutes` (TDD)

**Files:**
- Create: `tests/wa-copy-konten-routes.test.js`
- Create: `src/components/wa-copy/lib/kontenRoutes.js`
- Create: `src/components/wa-copy/lib/kontenRoutes.d.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `tests/wa-copy-konten-routes.test.js` with exactly:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKontenPath, kontenPath, kontenParentPath } from '../src/components/wa-copy/lib/kontenRoutes.js';

const ROUTES = [
  { route: { kind: 'list', tab: 'faq' }, path: '/dashboard/konten/faq' },
  { route: { kind: 'list', tab: 'caption' }, path: '/dashboard/konten/caption' },
  { route: { kind: 'entry-new', tab: 'tourleader' }, path: '/dashboard/konten/tourleader/tambah' },
  { route: { kind: 'entry-edit', tab: 'faq', id: 'faq-umum-pertama' }, path: '/dashboard/konten/faq/edit/faq-umum-pertama' },
  { route: { kind: 'cat-list', tab: 'caption' }, path: '/dashboard/konten/caption/kategori' },
  { route: { kind: 'cat-new', tab: 'faq' }, path: '/dashboard/konten/faq/kategori/tambah' },
  { route: { kind: 'cat-edit', tab: 'faq', value: 'umum' }, path: '/dashboard/konten/faq/kategori/edit/umum' },
  { route: { kind: 'cat-delete', tab: 'tourleader', value: 'persiapan' }, path: '/dashboard/konten/tourleader/kategori/hapus/persiapan' },
];

test('kontenPath builds canonical paths and parseKontenPath round-trips them', () => {
  for (const { route, path } of ROUTES) {
    assert.equal(kontenPath(route), path);
    const parsed = parseKontenPath(path);
    assert.deepEqual(parsed.route, route);
    assert.equal(parsed.canonical, true, `${path} should be canonical`);
  }
});

test('ids and category values survive URL encoding round-trips', () => {
  for (const raw of ['has space', 'a/b', 'ünïcode', '50%off', 'q?x=1&y=2']) {
    for (const route of [
      { kind: 'entry-edit', tab: 'faq', id: raw },
      { kind: 'cat-edit', tab: 'caption', value: raw },
      { kind: 'cat-delete', tab: 'faq', value: raw },
    ]) {
      const parsed = parseKontenPath(kontenPath(route));
      assert.deepEqual(parsed.route, route);
      assert.equal(parsed.canonical, true);
    }
  }
});

test('non-canonical and malformed paths fall back safely', () => {
  // bare base → default tab, flagged non-canonical so the page replace-navigates
  assert.deepEqual(parseKontenPath('/dashboard/konten'),
    { route: { kind: 'list', tab: 'faq' }, canonical: false });
  // unknown tab → global fallback
  assert.deepEqual(parseKontenPath('/dashboard/konten/xyz/tambah'),
    { route: { kind: 'list', tab: 'faq' }, canonical: false });
  // malformed sub-paths degrade to that tab's list
  for (const [p, tab] of [
    ['/dashboard/konten/faq/edit', 'faq'],             // missing id
    ['/dashboard/konten/faq/tambah/extra', 'faq'],
    ['/dashboard/konten/caption/unknown', 'caption'],
    ['/dashboard/konten/faq/kategori/hapus', 'faq'],   // missing value
    ['/dashboard/konten/faq/kategori/edit/x/y', 'faq'],
  ]) {
    const parsed = parseKontenPath(p);
    assert.deepEqual(parsed.route, { kind: 'list', tab }, p);
    assert.equal(parsed.canonical, false, p);
  }
  // not a konten path at all
  assert.deepEqual(parseKontenPath('/dashboard/jamaah'),
    { route: { kind: 'list', tab: 'faq' }, canonical: false });
  // malformed percent-encoding must not throw
  assert.equal(parseKontenPath('/dashboard/konten/faq/edit/%E0%A4%A').canonical, false);
});

test('kontenParentPath walks editor→list, kategori-sub→kategori, kategori→list, list→null', () => {
  assert.equal(kontenParentPath({ kind: 'list', tab: 'faq' }), null);
  assert.equal(kontenParentPath({ kind: 'entry-new', tab: 'faq' }), '/dashboard/konten/faq');
  assert.equal(kontenParentPath({ kind: 'entry-edit', tab: 'caption', id: 'x' }), '/dashboard/konten/caption');
  assert.equal(kontenParentPath({ kind: 'cat-list', tab: 'faq' }), '/dashboard/konten/faq');
  assert.equal(kontenParentPath({ kind: 'cat-new', tab: 'faq' }), '/dashboard/konten/faq/kategori');
  assert.equal(kontenParentPath({ kind: 'cat-edit', tab: 'faq', value: 'v' }), '/dashboard/konten/faq/kategori');
  assert.equal(kontenParentPath({ kind: 'cat-delete', tab: 'faq', value: 'v' }), '/dashboard/konten/faq/kategori');
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `node --test tests/wa-copy-konten-routes.test.js`
Expected: FAIL — `Cannot find module ... kontenRoutes.js`

- [ ] **Step 1.3: Implement the module**

Create `src/components/wa-copy/lib/kontenRoutes.js` with exactly:

```js
// Pure route logic for the /dashboard/konten admin subtree (URL = source of truth,
// see docs/superpowers/specs/2026-06-04-konten-url-routing-design.md).
// Plain JS + kontenRoutes.d.ts so node:test can exercise it directly — same pattern
// as categoryOps.js and hajiPlusPricing.js.

const KONTEN_BASE = '/dashboard/konten';
const TABS = ['faq', 'caption', 'tourleader'];

export function kontenPath(route) {
  const base = `${KONTEN_BASE}/${route.tab}`;
  switch (route.kind) {
    case 'list': return base;
    case 'entry-new': return `${base}/tambah`;
    case 'entry-edit': return `${base}/edit/${encodeURIComponent(route.id)}`;
    case 'cat-list': return `${base}/kategori`;
    case 'cat-new': return `${base}/kategori/tambah`;
    case 'cat-edit': return `${base}/kategori/edit/${encodeURIComponent(route.value)}`;
    case 'cat-delete': return `${base}/kategori/hapus/${encodeURIComponent(route.value)}`;
    default: return `${KONTEN_BASE}/faq`;
  }
}

export function parseKontenPath(pathname) {
  const fallback = { route: { kind: 'list', tab: 'faq' }, canonical: false };
  let segs;
  try {
    segs = String(pathname || '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return fallback; // malformed percent-encoding
  }
  if (segs[0] !== 'dashboard' || segs[1] !== 'konten') return fallback;
  const tab = segs[2];
  if (!TABS.includes(tab)) return fallback;
  const rest = segs.slice(3);
  let route = null;
  if (rest.length === 0) route = { kind: 'list', tab };
  else if (rest.length === 1 && rest[0] === 'tambah') route = { kind: 'entry-new', tab };
  else if (rest.length === 2 && rest[0] === 'edit') route = { kind: 'entry-edit', tab, id: rest[1] };
  else if (rest[0] === 'kategori') {
    const sub = rest.slice(1);
    if (sub.length === 0) route = { kind: 'cat-list', tab };
    else if (sub.length === 1 && sub[0] === 'tambah') route = { kind: 'cat-new', tab };
    else if (sub.length === 2 && sub[0] === 'edit') route = { kind: 'cat-edit', tab, value: sub[1] };
    else if (sub.length === 2 && sub[0] === 'hapus') route = { kind: 'cat-delete', tab, value: sub[1] };
  }
  if (!route) return { route: { kind: 'list', tab }, canonical: false };
  return { route, canonical: kontenPath(route) === pathname };
}

export function kontenParentPath(route) {
  switch (route.kind) {
    case 'entry-new':
    case 'entry-edit':
    case 'cat-list':
      return kontenPath({ kind: 'list', tab: route.tab });
    case 'cat-new':
    case 'cat-edit':
    case 'cat-delete':
      return kontenPath({ kind: 'cat-list', tab: route.tab });
    default:
      return null; // 'list' has no konten parent — caller goes home
  }
}
```

Create `src/components/wa-copy/lib/kontenRoutes.d.ts` with exactly:

```ts
export type KontenTab = 'caption' | 'faq' | 'tourleader';

export type KontenRoute =
  | { kind: 'list'; tab: KontenTab }
  | { kind: 'entry-new'; tab: KontenTab }
  | { kind: 'entry-edit'; tab: KontenTab; id: string }
  | { kind: 'cat-list'; tab: KontenTab }
  | { kind: 'cat-new'; tab: KontenTab }
  | { kind: 'cat-edit'; tab: KontenTab; value: string }
  | { kind: 'cat-delete'; tab: KontenTab; value: string };

export interface ParsedKontenPath {
  route: KontenRoute;
  canonical: boolean;
}

export function parseKontenPath(pathname: string): ParsedKontenPath;
export function kontenPath(route: KontenRoute): string;
export function kontenParentPath(route: KontenRoute): string | null;
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `node --test tests/wa-copy-konten-routes.test.js`
Expected: 4 tests, all PASS

- [ ] **Step 1.5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0

- [ ] **Step 1.6: Commit**

```bash
git branch --show-current   # MUST print: main
git add src/components/wa-copy/lib/kontenRoutes.js src/components/wa-copy/lib/kontenRoutes.d.ts tests/wa-copy-konten-routes.test.js
git commit -m "feat(konten): pure route module for URL-driven konten views

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/wa-copy/lib/kontenRoutes.js src/components/wa-copy/lib/kontenRoutes.d.ts tests/wa-copy-konten-routes.test.js
```

---

### Task 2: Rewire `CategoryManager`, `WaCopyAdminPage`, `DashboardLayout` to URL-derived views

**Files:**
- Modify: `tests/wa-copy-category-manager.test.js` (replace tests 3 and 4)
- Rewrite: `src/components/wa-copy/admin/CategoryManager.tsx`
- Rewrite: `src/components/wa-copy/admin/WaCopyAdminPage.tsx`
- Modify: `src/components/DashboardLayout.tsx` (8 precise edits)

All three source files must change in ONE commit — any partial subset breaks `tsc` (props interfaces change on both sides).

- [ ] **Step 2.1: Update the source-pattern tests (failing first)**

In `tests/wa-copy-category-manager.test.js`, replace the two tests `'CategoryManager wires the store, icons, counts, reorder, and reassign-delete'` and `'CategoryManager ignores stale backRequest on mount (re-open blink regression)'` (keep the other tests untouched) with exactly:

```js
test('CategoryManager wires the store, icons, counts, reorder, and reassign-delete', () => {
  const mgr = read('src/components/wa-copy/admin/CategoryManager.tsx');
  assert.match(mgr, /useWaCopyContent\(\)/);
  assert.match(mgr, /resolveCategoryIcon/);
  assert.match(mgr, /konten/);                 // per-category count label
  assert.match(mgr, /DeleteCategoryPanel/);    // delete delegates to reassign panel
  assert.match(mgr, /CategoryEditor/);         // create/edit delegates to the form
  assert.match(mgr, /navigateUp/);             // up-navigation instead of onExit
  assert.match(mgr, /kontenPath\(/);           // no hand-concatenated paths
});

test('konten views derive from the URL — no internal view state, no backRequest', () => {
  const mgr = read('src/components/wa-copy/admin/CategoryManager.tsx');
  const page = read('src/components/wa-copy/admin/WaCopyAdminPage.tsx');
  const layout = read('src/components/DashboardLayout.tsx');
  // The event-counter back mechanism is gone everywhere. It caused the 2026-06-04
  // "Kelola Kategori blink" (stale never-reset counter replayed by a mount effect);
  // with URL-derived views the whole bug class is structurally impossible.
  for (const [name, src] of [['CategoryManager', mgr], ['WaCopyAdminPage', page], ['DashboardLayout', layout]]) {
    assert.doesNotMatch(src, /backRequest/i, `${name} still references backRequest`);
  }
  assert.doesNotMatch(layout, /kontenEditorOpen/);
  // Views are pure functions of the parsed route.
  assert.match(page, /parsed\.canonical/);
  assert.match(page, /route\.kind === 'entry-edit'/);
  assert.doesNotMatch(page, /useState/, 'WaCopyAdminPage must not keep view state');
  assert.doesNotMatch(mgr, /useState<SubView>/);
  assert.match(layout, /parseKontenPath/);
  assert.match(layout, /kontenPushDepth/);
  // Sibling tab switches replace, not push.
  assert.match(page, /\{ replace: true \}/);
});
```

- [ ] **Step 2.2: Run to verify the new tests fail against current code**

Run: `node --test tests/wa-copy-category-manager.test.js`
Expected: FAIL — current sources still match `/backRequest/i` and lack `kontenPath(`/`parseKontenPath`.

- [ ] **Step 2.3: Rewrite `CategoryManager.tsx`**

Replace the entire file `src/components/wa-copy/admin/CategoryManager.tsx` with:

```tsx
import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWaCopyContent } from '../hooks/useWaCopyContent';
import { useToast, ToastPill } from '../hooks/useToast';
import { resolveCategoryIcon } from '../lib/categoryIcons';
import { kontenPath } from '../lib/kontenRoutes';
import type { KontenRoute } from '../lib/kontenRoutes';
import type { CategoryDraft, CategoryMeta } from '../lib/types';
import CategoryEditor from './CategoryEditor';
import DeleteCategoryPanel from './DeleteCategoryPanel';

export type KontenCatRoute = Extract<KontenRoute, { kind: 'cat-list' | 'cat-new' | 'cat-edit' | 'cat-delete' }>;

interface CategoryManagerProps {
  route: KontenCatRoute;
  navigate: (path: string, opts?: { replace?: boolean }) => void;
  navigateUp: () => void;
}

/** Category CRUD for one content type. The sub-view (list/create/edit/delete) is
 *  derived entirely from the route — reload restores it (see lib/kontenRoutes). */
export default function CategoryManager({ route, navigate, navigateUp }: CategoryManagerProps) {
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
  }[route.tab];

  const categories: CategoryMeta[] = [...cfg.categories].sort((a, b) => a.order - b.order);

  // Set while delete-confirm is navigating up itself, so the vanished-category
  // effect below doesn't fire a second (replace) navigation for the same removal.
  const leavingRef = useRef(false);
  useEffect(() => {
    leavingRef.current = false;
  }, [route]);

  // Route targets a category that's gone (deep link after reload, deleted elsewhere)
  // → snap back to the category list.
  const targetMissing =
    (route.kind === 'cat-edit' || route.kind === 'cat-delete') &&
    !categories.some(c => c.value === route.value);
  useEffect(() => {
    if (targetMissing && !leavingRef.current) {
      navigate(kontenPath({ kind: 'cat-list', tab: route.tab }), { replace: true });
    }
  }, [targetMissing, navigate, route.tab]);

  // ── Edit / create sub-view ────────────────────────────────────────
  if (route.kind === 'cat-new' || route.kind === 'cat-edit') {
    if (targetMissing) return null; // redirect effect above runs next frame
    const initial = route.kind === 'cat-edit' ? categories.find(c => c.value === route.value) : undefined;
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <CategoryEditor
          unitLabel={cfg.unit}
          initial={initial}
          onCancel={navigateUp}
          onSave={(draft: CategoryDraft) => {
            if (route.kind === 'cat-edit') cfg.update(route.value, draft);
            else cfg.create(draft);
            showToast(`${cfg.unit} tersimpan`);
            navigateUp();
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── Delete + reassign sub-view ────────────────────────────────────
  if (route.kind === 'cat-delete') {
    const category = categories.find(c => c.value === route.value);
    if (!category) return null; // redirect effect above runs next frame
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <DeleteCategoryPanel
          unitLabel={cfg.unit}
          category={category}
          others={categories.filter(c => c.value !== category.value)}
          count={cfg.countOf(category.value)}
          onCancel={navigateUp}
          onConfirm={reassignTo => {
            leavingRef.current = true;
            cfg.remove(category.value, reassignTo);
            showToast(`${cfg.unit} dihapus`);
            navigateUp();
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  const canDelete = categories.length > 1;

  return (
    <div className="px-4 pt-4 space-y-4" style={{ paddingBottom: '2rem' }}>
      <div className="flex items-center gap-2">
        <button
          onClick={navigateUp}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Kembali"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-sm font-bold text-gray-800 dark:text-white">{cfg.title}</h2>
      </div>

      <button
        onClick={() => navigate(kontenPath({ kind: 'cat-new', tab: route.tab }))}
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
                  onClick={() => navigate(kontenPath({ kind: 'cat-edit', tab: route.tab, value: cat.value }))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => navigate(kontenPath({ kind: 'cat-delete', tab: route.tab, value: cat.value }))}
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

> **As-landed deviation (8bb513c):** the `leavingRef` reset effect shown above is keyed on a primitive `const routeKey = kontenPath(route)` instead of `[route]` — the route object's identity changes on every parent render, which would have reset the delete-confirm guard mid-flow. Follow the committed code, not the literal block above.

- [ ] **Step 2.4: Rewrite `WaCopyAdminPage.tsx`**

Replace the entire file `src/components/wa-copy/admin/WaCopyAdminPage.tsx` with:

```tsx
import { useEffect } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import SegmentedControl from '../../common/SegmentedControl';
import { useWaCopyContent } from '../hooks/useWaCopyContent';
import { useToast, ToastPill } from '../hooks/useToast';
import type { WaTab } from '../lib/types';
import { kontenPath } from '../lib/kontenRoutes';
import type { ParsedKontenPath } from '../lib/kontenRoutes';
import ContentList, { type ContentRow } from './ContentList';
import CaptionEditor from './CaptionEditor';
import FaqEditor from './FaqEditor';
import TourLeaderEditor from './TourLeaderEditor';
import CategoryManager from './CategoryManager';

const TYPE_OPTIONS = [
  { value: 'faq' as WaTab, label: 'FAQ' },
  { value: 'caption' as WaTab, label: 'Caption' },
  { value: 'tourleader' as WaTab, label: 'Tour Leader' },
];

const firstLine = (s: string) => s.split('\n')[0].slice(0, 80);

interface Group<T extends { id: string; order: number }> {
  items: T[];
  groupOrder: string[];
  groupOf: (x: T) => string;
}

interface WaCopyAdminPageProps {
  parsed: ParsedKontenPath;
  navigate: (path: string, opts?: { replace?: boolean }) => void;
  navigateUp: () => void;
}

function buildRows<T extends { id: string; order: number; active: boolean }>(
  { items, groupOrder, groupOf }: Group<T>,
  toRow: (x: T) => { badge: string; title: string; subtitle: string },
): ContentRow[] {
  const sorted = [...items].sort(
    (a, b) => groupOrder.indexOf(groupOf(a)) - groupOrder.indexOf(groupOf(b)) || a.order - b.order,
  );
  return sorted.map(item => {
    const groupItems = sorted.filter(x => groupOf(x) === groupOf(item));
    const idx = groupItems.findIndex(x => x.id === item.id);
    const { badge, title, subtitle } = toRow(item);
    return { id: item.id, badge, title, subtitle, active: item.active, canUp: idx > 0, canDown: idx < groupItems.length - 1 };
  });
}

/** Internal admin editor for global WA Copy content (gated by admin role in
 *  DashboardLayout). The view is derived entirely from the URL — reload restores
 *  it (see lib/kontenRoutes). */
export default function WaCopyAdminPage({ parsed, navigate, navigateUp }: WaCopyAdminPageProps) {
  const { route } = parsed;
  const type: WaTab = route.tab;
  const content = useWaCopyContent();
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
  const { toast, showToast } = useToast();

  // Canonicalize legacy/malformed paths (e.g. /dashboard/konten → /dashboard/konten/faq).
  useEffect(() => {
    if (!parsed.canonical) navigate(kontenPath(parsed.route), { replace: true });
  }, [parsed, navigate]);

  // entry-edit whose id is gone (runtime items don't survive reload on the mock
  // store; item deleted elsewhere) → snap back to the tab list.
  const editId = route.kind === 'entry-edit' ? route.id : null;
  const editExists =
    editId === null ? true
    : type === 'caption' ? content.captions.some(c => c.id === editId)
    : type === 'faq' ? content.faqs.some(f => f.id === editId)
    : content.tourSteps.some(t => t.id === editId);
  useEffect(() => {
    if (!editExists) navigate(kontenPath({ kind: 'list', tab: type }), { replace: true });
  }, [editExists, navigate, type]);

  const afterSave = () => {
    showToast('Konten tersimpan');
    navigateUp();
  };

  // ── Category manager subtree ──────────────────────────────────────
  if (route.kind === 'cat-list' || route.kind === 'cat-new' || route.kind === 'cat-edit' || route.kind === 'cat-delete') {
    return <CategoryManager route={route} navigate={navigate} navigateUp={navigateUp} />;
  }

  // ── Editor view ───────────────────────────────────────────────────
  if (route.kind === 'entry-new' || route.kind === 'entry-edit') {
    if (!editExists) return null; // redirect effect above runs next frame
    if (type === 'caption') {
      const initial = editId ? content.captions.find(c => c.id === editId) : undefined;
      return (
        <div style={{ paddingBottom: '2rem' }}>
          <CaptionEditor
            categories={captionCats}
            initial={initial}
            onCancel={navigateUp}
            onSave={draft => {
              if (editId) content.updateCaption(editId, draft);
              else content.createCaption(draft);
              afterSave();
            }}
          />
          <ToastPill toast={toast} />
        </div>
      );
    }
    if (type === 'faq') {
      const initial = editId ? content.faqs.find(f => f.id === editId) : undefined;
      return (
        <div style={{ paddingBottom: '2rem' }}>
          <FaqEditor
            categories={faqCats}
            initial={initial}
            onCancel={navigateUp}
            onSave={draft => {
              if (editId) content.updateFaq(editId, draft);
              else content.createFaq(draft);
              afterSave();
            }}
          />
          <ToastPill toast={toast} />
        </div>
      );
    }
    const initial = editId ? content.tourSteps.find(t => t.id === editId) : undefined;
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <TourLeaderEditor
          categories={phaseCats}
          initial={initial}
          onCancel={navigateUp}
          onSave={draft => {
            if (editId) content.updateTour(editId, draft);
            else content.createTour(draft);
            afterSave();
          }}
        />
        <ToastPill toast={toast} />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  let rows: ContentRow[] = [];
  let onToggle: (id: string) => void = () => {};
  let onReorder: (id: string, dir: 'up' | 'down') => void = () => {};

  if (type === 'caption') {
    rows = buildRows(
      { items: content.captions, groupOrder: CAPTION_ORDER, groupOf: c => c.category },
      c => ({
        badge: CAPTION_LABEL[c.category],
        title: firstLine(c.template),
        subtitle: c.packageAware ? 'Pakai Paket' : '',
      }),
    );
    onToggle = content.toggleCaption;
    onReorder = content.reorderCaption;
  } else if (type === 'faq') {
    rows = buildRows(
      { items: content.faqs, groupOrder: FAQ_ORDER, groupOf: f => f.category },
      f => ({ badge: FAQ_LABEL[f.category], title: f.question, subtitle: '' }),
    );
    onToggle = content.toggleFaq;
    onReorder = content.reorderFaq;
  } else {
    rows = buildRows(
      { items: content.tourSteps, groupOrder: PHASE_ORDER, groupOf: t => t.phase },
      t => ({ badge: PHASE_LABEL[t.phase], title: t.title, subtitle: '' }),
    );
    onToggle = content.toggleTour;
    onReorder = content.reorderTour;
  }

  return (
    <div className="px-4 pt-4 pb-8 space-y-4" style={{ paddingBottom: '2rem' }}>
      <SegmentedControl
        options={TYPE_OPTIONS}
        value={type}
        onChange={tab => navigate(kontenPath({ kind: 'list', tab }), { replace: true })}
        accent="emerald"
      />

      <div className="flex gap-2">
        <button
          onClick={() => navigate(kontenPath({ kind: 'entry-new', tab: type }))}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <Plus size={16} />
          Tambah
        </button>
        <button
          onClick={() => navigate(kontenPath({ kind: 'cat-list', tab: type }))}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
        >
          <Settings2 size={16} />
          Kelola Kategori
        </button>
      </div>

      <ContentList rows={rows} onToggle={onToggle} onReorder={onReorder} onEdit={id => navigate(kontenPath({ kind: 'entry-edit', tab: type, id }))} />

      <ToastPill toast={toast} />
    </div>
  );
}
```

- [ ] **Step 2.5: Edit `DashboardLayout.tsx` (8 precise edits)**

Read the file fresh before editing — a parallel session may have shifted line numbers. Anchor on the quoted code, not on line numbers.

**Edit A — import the route module.** After the line `import WaCopyAdminPage from './wa-copy/admin/WaCopyAdminPage';` add:

```tsx
import { parseKontenPath, kontenParentPath } from './wa-copy/lib/kontenRoutes';
```

**Edit B — ensure `useRef` is imported.** Check the React import at the top of the file; if `useRef` is missing from it, add it (e.g. `import { useState, useEffect, useCallback, useRef } from 'react';` — preserve whatever else is already there).

**Edit C — replace the konten state with a push-depth ref.** Replace:

```tsx
  const [kontenEditorOpen, setKontenEditorOpen] = useState(false);
  const [kontenBackRequest, setKontenBackRequest] = useState(0);
```

with:

```tsx
  // History entries behind the current one that are internal konten pushes — lets
  // konten "up" use real history.back() without ever backing out of the app.
  const kontenPushDepth = useRef(0);
```

**Edit D — reset depth in `navigateTab`.** In the `navigateTab` callback, add `kontenPushDepth.current = 0;` as the first statement of the function body (before `setActiveTab(tab);`).

**Edit E — `navigatePath` gains `replace` + depth bookkeeping.** Replace:

```tsx
  const navigatePath = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    const tab = getTabFromPath();
    setActiveTab(tab);
    document.title = TAB_TITLES[tab] || 'Dashboard';
    setPathTick(t => t + 1);
  }, []);
```

with:

```tsx
  const navigatePath = useCallback((path: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) {
      window.history.replaceState({}, '', path);
    } else {
      // Internal konten→konten pushes are the entries konten "up" may back() over.
      const wasKonten = window.location.pathname.startsWith('/dashboard/konten');
      window.history.pushState({}, '', path);
      kontenPushDepth.current =
        wasKonten && path.startsWith('/dashboard/konten') ? kontenPushDepth.current + 1 : 0;
    }
    const tab = getTabFromPath();
    setActiveTab(tab);
    document.title = TAB_TITLES[tab] || 'Dashboard';
    setPathTick(t => t + 1);
  }, []);
```

**Edit F — popstate adjusts the depth.** In the popstate effect, replace:

```tsx
    const onPopState = () => {
      const tab = getTabFromPath();
      setActiveTab(tab);
```

with:

```tsx
    const onPopState = () => {
      const tab = getTabFromPath();
      // Any history move within konten consumes one tracked push (forward moves
      // undercount, which only downgrades konten "up" to a replace — never wrong UX).
      kontenPushDepth.current = tab === 'konten' ? Math.max(0, kontenPushDepth.current - 1) : 0;
      setActiveTab(tab);
```

**Edit G — add `kontenUp` after `navigatePath`.** Insert directly after the `navigatePath` definition:

```tsx
  // Konten "up": real back when the previous entry is our own push, else replace
  // to the parent route (deep link / fresh tab) — never exits the app.
  const kontenUp = useCallback(() => {
    const { route } = parseKontenPath(window.location.pathname);
    const parent = kontenParentPath(route);
    if (!parent) {
      navigateTab('home');
      return;
    }
    if (kontenPushDepth.current > 0) window.history.back();
    else navigatePath(parent, { replace: true });
  }, [navigatePath, navigateTab]);
```

(`navigateTab` is declared above `navigatePath` in the current file, so both are in scope.)

**Edit H — header chevron + render.** Replace:

```tsx
                // Konten editor → back to the previous internal Konten list view
                if (activeTab === 'konten' && kontenEditorOpen) {
                  setKontenBackRequest(n => n + 1);
                  return;
                }
```

with:

```tsx
                // Konten sub-view → step up to the parent konten view
                if (activeTab === 'konten' && parseKontenPath(window.location.pathname).route.kind !== 'list') {
                  kontenUp();
                  return;
                }
```

and replace:

```tsx
          {activeTab === 'konten' && isAdmin && (
            <WaCopyAdminPage
              backRequest={kontenBackRequest}
              onEditingChange={setKontenEditorOpen}
            />
          )}
```

with:

```tsx
          {activeTab === 'konten' && isAdmin && (
            <WaCopyAdminPage
              parsed={parseKontenPath(window.location.pathname)}
              navigate={navigatePath}
              navigateUp={kontenUp}
            />
          )}
```

- [ ] **Step 2.6: Run the konten test files**

Run: `node --test tests/wa-copy-category-manager.test.js tests/wa-copy-konten-routes.test.js`
Expected: all PASS (9 tests total: 5 + 4)

- [ ] **Step 2.7: Type-check and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected exit 0
Run: `npx vite build` — expected "✓ built" (warnings about chunk size are pre-existing and fine)

- [ ] **Step 2.8: Commit**

```bash
git branch --show-current   # MUST print: main
git add src/components/wa-copy/admin/CategoryManager.tsx src/components/wa-copy/admin/WaCopyAdminPage.tsx src/components/DashboardLayout.tsx tests/wa-copy-category-manager.test.js
git commit -m "feat(konten): URL-driven views — reload restores tab/editor/kategori

Every konten CRUD view now has its own URL (/dashboard/konten/{tab}[/tambah|
/edit/{id}|/kategori...]). The URL is the source of truth: WaCopyAdminPage and
CategoryManager derive their view from the parsed route; browser back is real
history; the header chevron steps up to the parent route. Deletes the synthetic
kontenBackRequest/kontenEditorOpen back mechanism (blink bug class, e65dc81).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/wa-copy/admin/CategoryManager.tsx src/components/wa-copy/admin/WaCopyAdminPage.tsx src/components/DashboardLayout.tsx tests/wa-copy-category-manager.test.js
```

---

### Task 3: Verification sweep (no code changes expected)

**Files:** none modified — read-only verification.

- [ ] **Step 3.1: No mechanism leftovers**

Run: `grep -rn "backRequest\|kontenEditorOpen\|onEditingChange" src/ | grep -v node_modules`
Expected: NO matches in any `.ts`/`.tsx` source (matches inside `docs/` don't count; this grep is scoped to `src/` so there should be zero lines).

- [ ] **Step 3.2: All WA Copy tests green**

Run: `node --test tests/wa-copy-category-manager.test.js tests/wa-copy-konten-routes.test.js tests/wa-copy-category-ops.test.js`
Expected: all PASS. (Note: `tests/wa-copy-faq-compact*` has 2 pre-existing failures unrelated to this work — do NOT try to fix them.)

- [ ] **Step 3.3: Full gate**

Run: `npx tsc --noEmit -p tsconfig.json` — exit 0
Run: `npx vite build` — "✓ built"

- [ ] **Step 3.4: Report**

Report PASS/FAIL for each step. Do not commit anything in this task.

---

## Manual verification (for the human, post-merge)

1. Login admin → Konten → URL becomes `/dashboard/konten/faq`.
2. Tambah → URL `/dashboard/konten/faq/tambah`; reload → still on the create form.
3. Edit a seeded FAQ → `/dashboard/konten/faq/edit/faq-umum-pertama`; reload → same form. (Items created at runtime do NOT survive reload — mock store — landing on the list instead is correct.)
4. Kelola Kategori → `/dashboard/konten/faq/kategori`; Tambah Kategori → `/kategori/tambah`; header chevron steps back one view at a time; re-open Kelola Kategori repeatedly → no blink (old bug repro).
5. Browser back/forward walks the views; back from the list leaves to home.
6. Switch tab FAQ→Caption→Tour Leader, then browser back once → straight back to home (tab switches don't stack history).
