# Konten Category Management Design

## Goal

Let admins add, edit, delete, and reorder content **categories** in `/dashboard/konten` (the WA Copy admin editor) for all three content types: Caption categories, FAQ categories, and Tour Leader phases. Today these are hardcoded TypeScript union types and cannot change at runtime.

## Background

The WA Copy admin (`src/components/wa-copy/admin/WaCopyAdminPage.tsx`) has three tabs — Caption, FAQ, Tour Leader. Each content type groups its items by a category (Tour Leader calls it `phase`). Categories are defined as:

- TypeScript union types in `lib/types.ts`: `CaptionCategory` (6 values), `FaqCategory` (5 values), `TourPhase` (3 values).
- Parallel metadata arrays `CAPTION_CATEGORIES` / `FAQ_CATEGORIES` / `TOUR_PHASES`, each entry `{ value, label, icon, tip }` where `icon` is a lucide-react component.

Categories drive: editor dropdowns, agent-facing filter chips, admin list grouping/badges, and per-category reordering. Content lives in the in-memory `useWaCopyContent` hook (no localStorage; explicitly an API-swap seam — "Swap this whole hook for an API client later").

## Decisions

- **Scope:** all three content types, including Tour Leader phases.
- **Delete policy:** reassign — when deleting a non-empty category, admin picks a target category and all content moves there, then the old category is removed.
- **Icon:** admin picks from a curated lucide icon set (icon picker).
- **Placement:** a **⚙ Kelola Kategori** button per tab, opening a category-manager view scoped to that content type (reuses the existing list↔editor view-swap pattern).
- **Architecture:** categories become first-class records inside the existing `useWaCopyContent` store; union types relax to `string`. One hook, one API-swap seam. Reassign-on-delete is a same-store operation.

## Data Model (`lib/types.ts`)

- Relax the category types from string-literal unions to plain `string` aliases:

  ```ts
  export type CaptionCategory = string;
  export type FaqCategory = string;
  export type TourPhase = string;
  ```

  Field names on content (`category`, `phase`) are unchanged; existing seed values become the initial IDs, so no existing content breaks.

- `CategoryMeta` becomes a stored record. The one substantive change is replacing the icon component with a serializable icon name, plus an explicit order:

  ```ts
  export interface CategoryMeta {
    value: string;     // stable id; never changes once created
    label: string;     // display name (editable)
    iconName: string;  // key into the icon registry (was: icon: ElementType)
    tip: string;       // optional helper text
    order: number;     // display/group order
  }
  ```

## Icon Registry (`lib/categoryIcons.ts`, new)

- `CATEGORY_ICON_OPTIONS: { name: string; icon: ElementType }[]` — a curated set (~30) of lucide icons offered in the picker. Must include every icon currently used by the seed categories so existing categories keep their look.
- `resolveCategoryIcon(name: string): ElementType` — returns the matching component, falling back to `Tag` for an unknown/missing name.

## Seed Data

`CAPTION_CATEGORIES` / `FAQ_CATEGORIES` / `TOUR_PHASES` in `lib/captions.ts`, `lib/faq.ts`, `lib/tourleader.ts` are rewritten to the new `CategoryMeta` shape (with `iconName` + `order`) and renamed to `*_CATEGORY_SEED` (and `TOUR_PHASE_SEED`). They are consumed only to initialize the store; live categories come from the hook thereafter.

## Store / Hook API (`useWaCopyContent.ts`)

Add three live arrays to the module-level store, cloned from seed and sorted by `order`:

- `captionCategories: CategoryMeta[]`
- `faqCategories: CategoryMeta[]`
- `tourPhases: CategoryMeta[]`

Add mutations per type, mirroring the existing content-CRUD/reorder conventions and emitting to listeners:

- `create{Caption,Faq,Tour}Category(draft: { label; iconName; tip })`
  - generates a stable `value` by slugifying `label`, de-duplicated against existing values (append `-2`, `-3`, … on collision);
  - `order = max(existing order) + 1`; appends the record.
- `update{…}Category(value, patch: { label?; iconName?; tip? })`
  - patches display fields only; `value` stays stable so content references never break.
- `delete{…}Category(value, reassignTo: string)`
  - moves every content item whose `category`/`phase` === `value` to `reassignTo`, re-appending `order` within the target group (no duplicate orders, no orphans);
  - then removes the category record.
  - **Guard:** refuse (no-op) if it is the only category for that type (no valid `reassignTo`).
- `reorder{…}Category(value, dir: 'up' | 'down')`
  - swaps `order` with the adjacent record; respects bounds (`canUp`/`canDown`).

All three families share identical logic; implement once as generic helpers parameterized by the store slice + the content field name (`category` vs `phase`), to avoid three copies.

## UI Components (under `admin/`)

- **`CategoryManager.tsx`** — generic over `kind: 'caption' | 'faq' | 'tour'`. Props: the live `categories`, per-category content counts, and the mutation callbacks. Renders:
  - header "Kategori {ContentType}" with a back affordance;
  - one row per category: resolved icon · label · "*N konten*" count · reorder up/down · edit (✎) · delete (✕);
  - **+ Tambah Kategori** button.
- **`CategoryEditor.tsx`** — create/edit form: `label` (text, required), **IconPicker**, `tip` (optional). Save/Cancel. Reuses the `INPUT_CLASS` / `LABEL_CLASS` styling from `FaqEditor`; `canSave` requires a non-empty label and a selected icon.
- **`IconPicker.tsx`** — grid of `CATEGORY_ICON_OPTIONS`; the selected icon is highlighted; defaults to the first option when creating.
- **Delete = reassign panel** (no modal library, so a state-swap panel consistent with the rest of the admin): "Pindahkan *N* konten ke: [dropdown of the other categories]" → **Hapus & Pindahkan** / Batal. If the category is the only one for its type, the delete control is disabled with an explanatory message.

## Integration (`WaCopyAdminPage.tsx`)

- Add a **⚙ Kelola Kategori** button next to the existing **+ Tambah** button, per tab.
- New `managingCategories: boolean` state, mutually exclusive with `editing`. When true, render `<CategoryManager kind={activeTab} … />` in place of the content list/editor.
- Wire `managingCategories` (and category-editing) into the existing `onEditingChange` / `backRequest` plumbing so the dashboard back button collapses the category manager first, matching how the content editor behaves today.
- Compute per-category content counts from the live content arrays to drive the row counts and the reassign dropdown.

## Consumer Updates (referential integrity)

Replace every direct import of `CAPTION_CATEGORIES` / `FAQ_CATEGORIES` / `TOUR_PHASES` with the hook's **live** category arrays:

- `WaCopyAdminPage` — label maps and group order derived from the live arrays (sorted by `order`).
- `CaptionEditor` / `FaqEditor` / `TourLeaderEditor` — dropdown options + default (first category) from live arrays.
- Agent-facing `CaptionTab` / `FaqTab` / `TourLeaderTab` and `CaptionCard` — filter chips/labels from live arrays.
- `FaqAccordionItem` stays untouched (preserves the `wa-copy-faq-compact` test, which forbids category references there).

Reassign-on-delete guarantees no orphaned content; `resolveCategoryIcon`'s default guards any unexpected lookup miss.

## Edge Cases

- Deleting the last category of a type is blocked (no reassign target).
- `IconPicker` defaults to the first icon, so a category always has a resolvable icon.
- Label is required; `value` is unique; labels may otherwise repeat.
- Reorder respects first/last bounds.
- In-memory only: category changes reset on page reload, consistent with all WA Copy content today. When the hook is later swapped for an API client, categories persist alongside content with no component API change.

## Testing

Add focused Node tests (matching the existing `tests/wa-copy-*.test.js` style):

- store: `create…Category` appends with a unique slug `value` and next `order`;
- store: `update…Category` changes label/icon/tip but keeps `value` stable;
- store: `reorder…Category` swaps order and respects bounds;
- store: `delete…Category(value, reassignTo)` moves all matching content to the target with valid (non-duplicate) order and removes the category — no orphans;
- store: `delete…Category` is a no-op when it is the only category for the type;
- a newly created category surfaces in the corresponding editor dropdown.

Existing `tests/wa-copy-admin-content-list.test.js` and `tests/wa-copy-faq-compact.test.js` must stay green.

Verify with the test suite, `tsc` (type-check), and `vite build` before completion.
