# Konten URL Routing Design

## Goal

Give every CRUD view inside `/dashboard/konten` (the WA Copy admin editor) its own URL, so a page reload lands back on the same view. The URL becomes the single source of truth for the konten view state; the synthetic back mechanism (`kontenBackRequest` counter + `kontenEditorOpen` flag) is deleted entirely.

## Background

`/dashboard/konten` renders `WaCopyAdminPage` (admin-gated in `DashboardLayout`). Its view state is currently in-memory React state across three layers:

- `type: WaTab` — segmented control (`faq | caption | tourleader`)
- `editing: null | { id: string | null }` — list vs create vs edit
- `managing: boolean` → `CategoryManager` with `sub: list | edit | delete`

A reload always falls back to the FAQ list. The dashboard header back chevron drives an event-counter prop (`backRequest`) — a mechanism that already produced one bug class (the 2026-06-04 "Kelola Kategori blink": a stale never-reset counter replayed on remount, fixed in `e65dc81`).

Routing in this app is hand-rolled: `DashboardLayout` owns `getTabFromPath()`, `navigateTab`, `navigatePath`, a `popstate` listener, and a `pathTick` re-render trigger. Sub-route precedents exist (`/dashboard/jamaah/daftar`, `/dashboard/ai-tools/*`). There is no router library, and this design deliberately does not introduce one.

Verified load-bearing facts:

- `getTabFromPath()` reads only `segments[1]`, so `/dashboard/konten/anything/deeper` already resolves to tab `konten` and inherits the `isAdmin` gate unchanged.
- `server.js` ends in a catch-all `app.get('{*path}')` serving `index.html` — deep paths reload fine.
- The PWA service worker's `navigateFallbackDenylist` includes `/^\/dashboard/` — no stale-cache risk for new deep routes.
- The content store (`useWaCopyContent`) is an in-memory mock: runtime-created items (`faq-new-1`, …) and edits vanish on reload; seed ids are stable strings. Deep links to runtime ids must fail gracefully.

## Decisions

- **Depth:** full — tab, editor (including item id), and the whole category-manager subtree get URLs.
- **Architecture:** URL = source of truth. View is derived from the path on every render; no internal view state remains.
- **Back:** browser back/forward is real history. Header chevron (and the manager's own chevron, and editor save/cancel) means "up to parent", implemented as `history.back()` when the previous entry is a known internal push, else `navigate(parent, { replace: true })`.
- **Slugs:** Indonesian (`tambah`, `kategori`, `hapus`), matching `/dashboard/jamaah/daftar` and the UI labels.
- **No router library:** follow the existing hand-rolled pattern (approach chosen over react-router/wouter and over a generic `usePathRoute()` hook — one routing system in the app, no new dependency).

## URL Scheme

```
/dashboard/konten                              → list, default tab (faq)
/dashboard/konten/{tab}                        → list      (tab: faq | caption | tourleader)
/dashboard/konten/{tab}/tambah                 → editor, create
/dashboard/konten/{tab}/edit/{id}              → editor, edit item
/dashboard/konten/{tab}/kategori               → category manager, list
/dashboard/konten/{tab}/kategori/tambah        → category create
/dashboard/konten/{tab}/kategori/edit/{value}  → category edit
/dashboard/konten/{tab}/kategori/hapus/{value} → category delete + reassign panel
```

## Route Module (`src/components/wa-copy/lib/kontenRoutes.js` + `.d.ts`)

Pure logic, runtime-testable with `node:test` — same pattern as `categoryOps.js`/`hajiPlusPricing.js`.

```ts
type KontenRoute =
  | { kind: 'list';        tab: WaTab }
  | { kind: 'entry-new';   tab: WaTab }
  | { kind: 'entry-edit';  tab: WaTab; id: string }
  | { kind: 'cat-list';    tab: WaTab }
  | { kind: 'cat-new';     tab: WaTab }
  | { kind: 'cat-edit';    tab: WaTab; value: string }
  | { kind: 'cat-delete';  tab: WaTab; value: string }

parseKontenPath(pathname: string): { route: KontenRoute; canonical: boolean }
kontenPath(route: KontenRoute): string           // builder — components never hand-concatenate paths
kontenParentPath(route: KontenRoute): string | null  // editor→list, cat-*→cat-list, cat-list→list, list→null (null = leave to home)
```

`canonical` is false when the input was not the exact path for the parsed route (unknown tab, malformed sub-path, decode failure — these parse to the nearest safe route). `WaCopyAdminPage` replace-navigates to `kontenPath(route)` in an effect when `canonical` is false. `{id}`/`{value}` segments are `encodeURIComponent`-ed by the builder and decoded by the parser.

## Component Changes

**`DashboardLayout.tsx`**
- Delete `kontenEditorOpen` + `kontenBackRequest` state.
- `navigatePath` gains a `replace` option (uses `history.replaceState`; still bumps `pathTick`).
- Render becomes `<WaCopyAdminPage parsed={parseKontenPath(window.location.pathname)} navigate={navigatePath} />` (re-evaluated each render; `pathTick` already forces re-render on popstate).
- Header chevron, konten branch: route `kind === 'list'` → `navigateTab('home')` (as today); deeper → "up" behavior (below).

**`WaCopyAdminPage.tsx`**
- Delete `type`/`editing`/`managing` state, all three back/editing effects, and the `backRequest`/`onEditingChange` props.
- Derive everything from `route`: segmented control value = `route.tab`; editor open when `kind` is `entry-new`/`entry-edit`; `CategoryManager` rendered for the `cat-*` kinds.
- Navigation: tab switch → `navigate(kontenPath({kind:'list', tab}), { replace: true })` (sibling tabs don't stack history); Tambah / row-edit / Kelola Kategori → push; editor save/cancel → up.

**`CategoryManager.tsx`**
- Delete `sub` state, `backRequest` prop, `seenBackRequest` ref and both effects.
- Sub-view from `route.kind`; all buttons become navigations (chevron → up, Tambah/edit/hapus → push, panel cancel/confirm → up).
- The "category vanished" guard becomes: effect sees `cat-edit`/`cat-delete` whose `value` is not in the store → `navigate(cat-list, { replace: true })`.

**Up navigation.** A small ref in `DashboardLayout` tracks how many history entries behind the current one are internal konten pushes. "Up" = `history.back()` when that depth is > 0; otherwise `navigate(kontenParentPath(route), { replace: true })`. Exact bookkeeping (increment on push, how popstate adjusts it) is an implementation-plan detail; the invariant is: never `history.back()` out of the app, never stack duplicate list entries in the common flow. This keeps history clean in the normal flow and never exits the app on direct-loaded deep URLs. (Acceptable simplification if it proves fiddly in implementation: always `history.back()` and accept the fresh-tab-paste edge case — decide in the plan, but the counter is the spec'd default.)

Store, editors (`CaptionEditor`/`FaqEditor`/`TourLeaderEditor`/`CategoryEditor`/`DeleteCategoryPanel`), toast, and the agent-facing `WaCopyPage` are untouched. `WaCopyAdminPage` and `CategoryManager` stay mounted across internal route changes, so post-save toasts keep working.

## Edge Cases

- **Stale item id** (runtime-created content lost on reload, or item deleted in another view): editor route whose id is missing from the store → effect replace-navigates to the tab list. Same for unknown category `value` → category list. When the mock store is later swapped for the real API, ids become durable and these same URLs turn into working deep links — no design change needed.
- **Unknown tab/sub-segment** → replace-navigate to canonical `/dashboard/konten/faq`.
- **Reload** preserves the history stack, so back-after-reload behaves correctly; server catch-all + SW denylist verified above.
- **Non-admin / logged-out** on a deep URL: existing `isAdmin` gate and login redirect already apply (tab resolution unchanged).
- **Document title** stays `TAB_TITLES['konten']` for all sub-views (no per-view titles — YAGNI).

## Testing

- **Replace** the now-obsolete `seenBackRequest` blink-regression test in `tests/wa-copy-category-manager.test.js` (the mechanism it pins is deleted).
- New `tests/wa-copy-konten-routes.test.js`: real unit tests for `parseKontenPath`/`kontenPath`/`kontenParentPath` — round-trip every route kind, encode/decode of ids, unknown-segment fallbacks, parent chain.
- Source-pattern tests (repo idiom): `backRequest`/`kontenBackRequest`/`kontenEditorOpen` appear nowhere in `src/components/wa-copy/` or `DashboardLayout.tsx`; `WaCopyAdminPage`/`CategoryManager` take `route` and call `kontenPath` (no hand-built paths); tab switch uses `replace: true`.
- Gate: `node --test tests/wa-copy-*.test.js` + `npx tsc --noEmit` + `npx vite build`.
- Manual: reload on every route kind; back/forward through a full CRUD round-trip; re-open Kelola Kategori repeatedly (the old blink repro).
