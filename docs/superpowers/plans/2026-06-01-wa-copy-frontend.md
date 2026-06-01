# WA Copy — Front-End (V1) Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. FE-only, no backend. No new deps. No localStorage. UI text in Bahasa Indonesia, code in English.

**Goal:** Build the "WA Copy" AI tool — a 3-tab content hub (Caption / FAQ / Tour Leader) for agents plus an internal admin editor — wired into the existing dashboard, driven by a swappable in-memory mock data layer and a placeholder engine that fills agent + package tokens.

**Architecture:** Self-contained feature folder `src/components/wa-copy/` (page shell + tabs + admin + hooks + lib + utils), one shared extracted `common/SegmentedControl.tsx`, registered as an AI tool (`route: 'wa-copy'`) and an admin sub-route (`route: 'wa-copy-admin'`) in `AIToolsPage.tsx` + `DashboardLayout.tsx`. Data flows from a single `useWaCopyContent()` hook (module-level in-memory store + mock latency) so swapping to an API later only touches the hook. The placeholder engine parses templates into typed `Segment[]` for highlighted preview and resolves to plain text for copy/share.

**Tech Stack:** React 18 + TS, Vite, TailwindCSS (utility-only, `darkMode: 'class'`), Framer Motion (`framer-motion`), lucide-react. Verification: `npx tsc --noEmit`, `npm run lint`, `npm run build` (no FE unit-test runner exists).

---

## Reconciliations with reality (locked decisions, deviating from spec assumptions)

These were confirmed by codebase recon and override the spec where the spec assumed something that does not exist:

1. **Admin guard = `agentData.role === 'admin'`**, NOT a client `SM140`/parent check. The front-end `AuthUser` has only `slug,name,role('admin'|'agent'),photo,website,phone,email`. SM140→admin is collapsed server-side. We mirror the existing `agents`/`analytics` gate (`DashboardLayout.tsx:442` `const isAdmin = agentData.role === 'admin'`).
2. **`useAgentContext()` derives `{nama, wa, link}`** from `getStoredSession()` (`src/components/LoginPage.tsx`): `nama←user.name`, `wa←user.phone` (already `628…`), `link←https://alhijaz.co/${user.slug}` (no stored `link`/`wa` field).
3. **Package data**: `getPackages()` returns `{ success, packages: UmrohPackage[] }` (wrapper, not array). No scalar price/date/duration. `{paket}←pkg.nama`, `{harga}←formatPrice(getMinimumPrice(pkg))`, `{tanggal}←formatTanggalID(pkg.keberangkatan.tgl)`, `{maskapai}←pkg.maskapai`, `{hari}←calculateDuration(pkg)+' hari'`. All from `@/services`.
4. **FaqPage has no Framer accordion / search / chips** and `FaqEntry` has only `id/question/answer`. We reuse the `FaqEntry` type and BUILD a new Framer height-auto accordion + search + chips per DESIGN-SYSTEM (height-collapse: `duration 0.28, ease [0.22,1,0.36,1]`).
5. **Bottom sheet** clones `BirthdayDetailSheet` (portal→`document.body`, backdrop+panel siblings, slide-up tween `y:'100%'→0, 0.25s, ease [0.4,0,0.2,1]`). We ADD `AnimatePresence` + exit in the parent for a slide-down close.
6. **No shared toast/clipboard/wa.me util** — we create feature-local `utils/waLink.ts` (copy w/ execCommand fallback; `wa.me/?text=` broadcast + `navigator.share` gated by `isTouchPrimary()`) and a `useToast` (dark pill, 1800ms).
7. **SegmentedControl**: extract a generic component from the SettingsPage pattern (pure-CSS, accent prop, emerald default) and refactor SettingsPage to consume it (honours "ekstrak").

---

## File structure

**Create:**
- `src/components/common/SegmentedControl.tsx` — generic iOS pill tabs (`options/value/onChange/accent`).
- `src/components/wa-copy/WaCopyPage.tsx` — content-only shell (SegmentedControl + tab switch + skeleton + toast host + admin entry).
- `src/components/wa-copy/lib/types.ts` — all WA Copy types.
- `src/components/wa-copy/lib/captions.ts` — `CAPTION_SEED`, caption-category metadata.
- `src/components/wa-copy/lib/faq.ts` — `WA_COPY_FAQ_SEED` (reuses `FaqEntry`), faq-category metadata.
- `src/components/wa-copy/lib/tourleader.ts` — `TOUR_SEED`, phase metadata.
- `src/components/wa-copy/lib/placeholders.ts` — `parse`, `resolveToPlain`, token registry, `formatTanggalID`, `buildPackageContext`.
- `src/components/wa-copy/utils/waLink.ts` — `copyToClipboard`, `buildWaLink`, `shareCaption`.
- `src/components/wa-copy/hooks/useAgentContext.ts`
- `src/components/wa-copy/hooks/useSelectedPackage.ts`
- `src/components/wa-copy/hooks/useWaCopyContent.ts`
- `src/components/wa-copy/hooks/useToast.tsx` — `{toast, showToast}` + `<ToastPill>`.
- `src/components/wa-copy/tabs/caption/{CaptionTab,CaptionCard,PreviewText,CategoryChips,PackageSheet}.tsx`
- `src/components/wa-copy/tabs/faq/{FaqTab,FaqAccordionItem}.tsx`
- `src/components/wa-copy/tabs/tourleader/{TourLeaderTab,TourStepCard}.tsx`
- `src/components/wa-copy/admin/{WaCopyAdminPage,ContentList,CaptionEditor,FaqEditor,TourLeaderEditor}.tsx`

**Modify:**
- `src/components/AIToolsPage.tsx` — import `MessageCircle`; add `wa-copy` TOOLS entry (color `emerald`).
- `src/components/DashboardLayout.tsx` — import `MessageCircle` + `WaCopyPage`/`WaCopyAdminPage`; router branches `wa-copy`/`wa-copy-admin` (admin gated); AI_SUB_STYLES entries; 2 title ternaries; back-button branch.
- `src/components/SettingsPage.tsx` — replace inline tab bar with `<SegmentedControl>`.

---

## Types (`lib/types.ts`)

```ts
import type { FaqEntry } from '../../portal-jamaah/lib/faq';

export type WaTab = 'caption' | 'faq' | 'tourleader';

export type CaptionCategory =
  | 'sentuhan_hati' | 'mumpung_sempat' | 'ringan_kantong'
  | 'kata_jamaah' | 'aman_tepercaya' | 'tips_info';

export type FaqCategory =
  | 'pembayaran' | 'dokumen' | 'keberangkatan' | 'fasilitas' | 'umum';

export type TourPhase = 'sebelum' | 'saat' | 'setelah';

export interface CaptionEntry {
  id: string;
  category: CaptionCategory;
  packageAware: boolean;
  template: string;
  order: number;
  active: boolean;
}

export interface AgentFaqEntry extends FaqEntry { // FaqEntry = { id, question, answer }
  category: FaqCategory;
  order: number;
  active: boolean;
}

export interface TourStep {
  id: string;
  phase: TourPhase;
  title: string;
  body: string;
  order: number;
  active: boolean;
}

export type SegmentKind = 'plain' | 'agent' | 'package' | 'unfilled';
export interface Segment { text: string; kind: SegmentKind; }

export interface AgentContext { nama: string; wa: string; link: string; }
export interface PackageContext {
  paket: string; harga: string; tanggal: string; maskapai: string; hari: string;
}
export type PlaceholderContext = {
  agent: AgentContext | null;
  pkg: PackageContext | null;
};

// token → which context + key it resolves from
export type AgentToken = 'nama' | 'wa' | 'link';
export type PackageToken = 'paket' | 'harga' | 'tanggal' | 'maskapai' | 'hari';
```

## Placeholder engine (`lib/placeholders.ts`) — contract

```ts
export const AGENT_TOKENS: AgentToken[] = ['nama', 'wa', 'link'];
export const PACKAGE_TOKENS: PackageToken[] = ['paket', 'harga', 'tanggal', 'maskapai', 'hari'];
const TOKEN_RE = /\{(nama|wa|link|paket|harga|tanggal|maskapai|hari)\}/g;

export function formatTanggalID(isoDate: string): string // 'YYYY-MM-DD' -> 'Senin, 1 Juni 2026' (Asia/Jakarta, Intl id-ID); '' on invalid
export function buildPackageContext(pkg: UmrohPackage): PackageContext // uses getMinimumPrice+formatPrice, calculateDuration, formatTanggalID
export function parse(template: string, ctx: PlaceholderContext): Segment[]
  // splits on TOKEN_RE; agent/package tokens become {text: resolvedValue, kind}
  // if token's context is null/empty -> {text: '{token}', kind: 'unfilled'}
export function resolveToPlain(template: string, ctx: PlaceholderContext): string
  // same resolution, joins text; unfilled tokens render as their literal '{token}' removed? -> keep readable: unresolved package tokens collapse to '' OR literal. DECISION: unresolved -> '' for plain copy is confusing; keep the human label e.g. {harga}->'(harga paket)'. See step impl.
```

Resolution rules (locked):
- Agent tokens resolve from `ctx.agent` (always present in dashboard). `nama→agent.nama`, `wa→agent.wa`, `link→agent.link`.
- Package tokens resolve from `ctx.pkg`. When no package selected → `kind:'unfilled'`, preview shows the literal `{paket}` chip in amber; `resolveToPlain` substitutes a neutral Indonesian hint so copied text never contains raw braces.

## Hook contracts

- `useAgentContext(): AgentContext` — reads `getStoredSession()` once (useState seed), derives nama/wa/link; falls back to empty strings if no session.
- `useSelectedPackage(): { packages, selected, selectedCtx, loading, error, select(jadwalId|null), reload }` — loads via `getPackages({ yearCode:'1448' })`, builds `PackageContext` for the selected pkg.
- `useWaCopyContent(): { captions, faqs, tourSteps, loading, createCaption/updateCaption/toggleCaption/reorderCaption, ...Faq, ...Tour }` — module-level store seeded from `*_SEED`, mock latency `WA_COPY_LATENCY_MS=350`, mutators update the store synchronously and bump a version state to re-render. NO localStorage.
- `useToast(): { toast, showToast }` + exported `<ToastPill toast={toast} />` — dark pill `bg-gray-900 ... rounded-full`, 1800ms.

## Integration diffs (exact)

**AIToolsPage.tsx**
- Line 2: add `MessageCircle` to the lucide import.
- After line 30 (`brosur-jadwal` entry) insert:
```tsx
  {
    id: 'wa-copy',
    name: 'WA Copy',
    desc: 'Caption, FAQ & panduan tour leader siap kirim WA',
    icon: MessageCircle,
    color: 'emerald',
    route: 'wa-copy',
    active: true,
  },
```

**DashboardLayout.tsx**
- Line 7: add `MessageCircle,` to lucide import.
- After line 30: `import WaCopyPage from './wa-copy/WaCopyPage';` and `import WaCopyAdminPage from './wa-copy/admin/WaCopyAdminPage';`
- Back-button onClick (after line 480, before the generic `window.history.pushState({}, '', '/dashboard/ai-tools')`): add a `wa-copy-admin → wa-copy` branch.
- AI_SUB_STYLES (after line 506): add `'wa-copy'` and `'wa-copy-admin'` entries (emerald, MessageCircle).
- Mount title ternary (before line 401 fallback): add `wa-copy → 'WA Copy'`, `wa-copy-admin → 'WA Copy Admin'`.
- Router IIFE (after line 650 brosur branch): add `wa-copy` and `wa-copy-admin` branches (admin gated by `isAdmin`, non-admin falls back to `<WaCopyPage>`).
- onNavigate title ternary (line 678): add `toolId === 'wa-copy' ? 'WA Copy' :`.

**SettingsPage.tsx**
- Import `SegmentedControl from './common/SegmentedControl'`.
- Replace the inner segmented track (lines 72–93) with `<SegmentedControl options={TAB_CONFIG.map(t=>({value:t.id,label:t.label,icon:t.icon}))} value={activeTab} onChange={switchTab} accent="emerald" />`, keeping the sticky + max-w wrappers.

## Tasks (build order)

1. `common/SegmentedControl.tsx` (foundation; used by SettingsPage + WaCopyPage + admin).
2. `lib/types.ts`.
3. `lib/placeholders.ts` + seeds (`captions.ts`, `faq.ts`, `tourleader.ts`).
4. `utils/waLink.ts`.
5. hooks (`useAgentContext`, `useSelectedPackage`, `useWaCopyContent`, `useToast`).
6. caption tab (`PreviewText`, `CategoryChips`, `PackageSheet`, `CaptionCard`, `CaptionTab`).
7. faq tab (`FaqAccordionItem`, `FaqTab`).
8. tour leader tab (`TourStepCard`, `TourLeaderTab`).
9. `WaCopyPage.tsx` shell.
10. admin (`CaptionEditor`, `FaqEditor`, `TourLeaderEditor`, `ContentList`, `WaCopyAdminPage`).
11. Integration edits (AIToolsPage, DashboardLayout, SettingsPage).
12. Verify: `npx tsc --noEmit` → `npm run lint` (wa-copy paths) → `npm run build`.

## Self-review notes
- Spec coverage: caption/faq/tourleader tabs ✓, package sheet ✓, placeholder engine (agent+package chips, plain resolve, wa.me) ✓, admin editors + ContentList reorder (up/down buttons, no @dnd) ✓, loading skeleton / empty / toast ✓, SegmentedControl extraction ✓, registration ✓.
- Deviations documented above (admin=role, no Framer in source FAQ, package wrapper shape).
- No localStorage; in-memory module store survives the page remount-on-nav so edits persist within the session.
