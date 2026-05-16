# Portal Jamaah Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rombak menyeluruh Portal Jamaah (`/[slug]/jamaah/dashboard`) — ganti bottom nav 4-tab dengan 6-card menu grid pattern (mirror agent dashboard), tambah dark mode, upgrade typography untuk audience 40+, align dengan DESIGN-SYSTEM.md.

**Architecture:** Single-page React app dengan state machine 7 routes (`'beranda' | 'perjalanan' | 'pembayaran' | 'dokumen' | 'perlengkapan' | 'manasik' | 'faq'`). Beranda = landing dengan hero countdown + menu grid 3×2 + widgets. Sub-pages diakses via tap menu card, kembali via back button di top bar. Sticky WhatsApp CTA persist di semua route. Dark mode applied via `document.documentElement.classList.toggle('dark')`, state di `localStorage.portalDarkMode`.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + lucide-react icons. Tests = `node:test` + structural assertions (file exists + grep for expected className/string).

**Spec:** [docs/superpowers/specs/2026-05-15-portal-jamaah-redesign-design.md](../specs/2026-05-15-portal-jamaah-redesign-design.md)

---

## File Inventory

### New files (15)
- `src/components/portal-jamaah/hooks/usePortalTheme.ts` — dark mode state + toggle hook
- `src/components/portal-jamaah/hooks/usePortalRoute.ts` — route enum + navigation hook
- `src/components/portal-jamaah/lib/faq.ts` — hardcoded FAQ array
- `src/components/portal-jamaah/lib/portalMenu.ts` — MENU_CARDS config (icon, colors, desc per menu)
- `src/components/portal-jamaah/lib/portalAlerts.ts` — smart alerts derivation logic
- `src/components/portal-jamaah/lib/portalTasks.ts` — top-3 task derivation from tahapan
- `src/components/portal-jamaah/components/ThemeToggle.tsx`
- `src/components/portal-jamaah/components/PortalBackBar.tsx`
- `src/components/portal-jamaah/components/StickyWhatsAppCta.tsx`
- `src/components/portal-jamaah/components/HeroCountdown.tsx`
- `src/components/portal-jamaah/components/PortalMenuCard.tsx`
- `src/components/portal-jamaah/components/PortalMenuGrid.tsx`
- `src/components/portal-jamaah/components/SmartAlertsStrip.tsx`
- `src/components/portal-jamaah/components/TaskListWidget.tsx`
- `src/components/portal-jamaah/pages/BerandaPage.tsx`
- `src/components/portal-jamaah/pages/PerjalananPage.tsx`
- `src/components/portal-jamaah/pages/PembayaranPage.tsx`
- `src/components/portal-jamaah/pages/DokumenPage.tsx`
- `src/components/portal-jamaah/pages/PerlengkapanPage.tsx`
- `src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx`
- `src/components/portal-jamaah/pages/FaqPage.tsx`
- `tests/portal-jamaah-redesign.test.js` — structural & DESIGN-SYSTEM parity assertions

### Modified files (3)
- `src/components/portal-jamaah/pages/PortalDashboard.tsx` — replace tab state with route state machine, wire pages
- `src/components/portal-jamaah/components/PortalTopBar.tsx` — DESIGN-SYSTEM colors, backdrop-blur, dark toggle slot, larger touch, remove dummy bell
- `src/components/portal-jamaah/components/RosterItem.tsx` — gender ring + payment overlay + visual progress bar
- `src/components/portal-jamaah/components/FlightCard.tsx` — DESIGN-SYSTEM colors + dark mode
- `src/components/portal-jamaah/components/HotelCard.tsx` — same
- `src/components/portal-jamaah/components/ItineraryList.tsx` — same
- `src/components/portal-jamaah/components/JamaahPaymentCard.tsx` — same
- `src/components/portal-jamaah/components/LogoutMenu.tsx` — same
- `tests/portal-jamaah-frontend.test.js` — update file list (remove deleted, add new)

### Deleted files (6)
- `src/components/portal-jamaah/components/PortalBottomNav.tsx`
- `src/components/portal-jamaah/components/StatusCard.tsx`
- `src/components/portal-jamaah/tabs/BerandaTab.tsx`
- `src/components/portal-jamaah/tabs/PerjalananTab.tsx`
- `src/components/portal-jamaah/tabs/BayarTab.tsx`
- `src/components/portal-jamaah/tabs/PersiapanTab.tsx`
- `src/components/portal-jamaah/tabs/persiapan/PersiapanHeader.tsx` (sub-tab specific, no longer used)

### Keep but reuse from `tabs/persiapan/` (utility components used by new pages)
- `tabs/persiapan/DokumenSubTab.tsx` → imported by new DokumenPage as `<DokumenContent>` (refactor: rename inside)
- `tabs/persiapan/PerlengkapanSubTab.tsx` → imported by new PerlengkapanPage
- `tabs/persiapan/SpiritualSubTab.tsx` → imported by new ManasikSpiritualPage
- `tabs/persiapan/{ChecklistItem,JamaahSelector,PerlengkapanItem,PhaseSection,ProgressRing}.tsx` → unchanged
- `tabs/persiapan/TahapanSubTab.tsx` → **delete**, logic absorbed into `TaskListWidget`

---

## Pre-Work: Verify baseline

- [ ] **Verify baseline test passes**

Run: `node --test tests/portal-jamaah-frontend.test.js`
Expected: All tests PASS (no changes yet).

- [ ] **Verify lint passes**

Run: `npm run lint -- src/components/portal-jamaah/`
Expected: 0 errors.

- [ ] **Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

---

## Task 1: Test infrastructure for redesign

**Files:**
- Create: `tests/portal-jamaah-redesign.test.js`

This task creates the test scaffold. Subsequent tasks add specific assertions to it.

- [ ] **Step 1: Create the test file scaffold**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

function exists(path) {
  return existsSync(join(rootPath, path));
}

// New file presence — added incrementally per task
test('redesign: new files exist', () => {
  const newFiles = [
    'src/components/portal-jamaah/hooks/usePortalTheme.ts',
    'src/components/portal-jamaah/hooks/usePortalRoute.ts',
    'src/components/portal-jamaah/lib/faq.ts',
    'src/components/portal-jamaah/lib/portalMenu.ts',
    'src/components/portal-jamaah/lib/portalAlerts.ts',
    'src/components/portal-jamaah/lib/portalTasks.ts',
    'src/components/portal-jamaah/components/ThemeToggle.tsx',
    'src/components/portal-jamaah/components/PortalBackBar.tsx',
    'src/components/portal-jamaah/components/StickyWhatsAppCta.tsx',
    'src/components/portal-jamaah/components/HeroCountdown.tsx',
    'src/components/portal-jamaah/components/PortalMenuCard.tsx',
    'src/components/portal-jamaah/components/PortalMenuGrid.tsx',
    'src/components/portal-jamaah/components/SmartAlertsStrip.tsx',
    'src/components/portal-jamaah/components/TaskListWidget.tsx',
    'src/components/portal-jamaah/pages/BerandaPage.tsx',
    'src/components/portal-jamaah/pages/PerjalananPage.tsx',
    'src/components/portal-jamaah/pages/PembayaranPage.tsx',
    'src/components/portal-jamaah/pages/DokumenPage.tsx',
    'src/components/portal-jamaah/pages/PerlengkapanPage.tsx',
    'src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx',
    'src/components/portal-jamaah/pages/FaqPage.tsx',
  ];
  for (const f of newFiles) {
    assert.ok(exists(f), `expected ${f} to exist`);
  }
});

test('redesign: deleted files no longer exist', () => {
  const deleted = [
    'src/components/portal-jamaah/components/PortalBottomNav.tsx',
    'src/components/portal-jamaah/components/StatusCard.tsx',
    'src/components/portal-jamaah/tabs/BerandaTab.tsx',
    'src/components/portal-jamaah/tabs/PerjalananTab.tsx',
    'src/components/portal-jamaah/tabs/BayarTab.tsx',
    'src/components/portal-jamaah/tabs/PersiapanTab.tsx',
    'src/components/portal-jamaah/tabs/persiapan/PersiapanHeader.tsx',
    'src/components/portal-jamaah/tabs/persiapan/TahapanSubTab.tsx',
  ];
  for (const f of deleted) {
    assert.ok(!exists(f), `expected ${f} to be deleted`);
  }
});

// Helper for design-system parity checks — used by subsequent tests
export { read, exists };
```

- [ ] **Step 2: Run test to verify it fails as expected**

Run: `node --test tests/portal-jamaah-redesign.test.js`
Expected: FAIL — files don't exist yet. This is expected.

- [ ] **Step 3: Commit**

```bash
git add tests/portal-jamaah-redesign.test.js
git commit -m "test: scaffold portal jamaah redesign test file"
```

---

## Task 2: Dark mode hook (`usePortalTheme`)

**Files:**
- Create: `src/components/portal-jamaah/hooks/usePortalTheme.ts`
- Modify: `tests/portal-jamaah-redesign.test.js` (add hook content test)

- [ ] **Step 1: Add hook content test**

Append to `tests/portal-jamaah-redesign.test.js`:

```javascript
test('usePortalTheme: persists in localStorage and toggles dark class', () => {
  const src = read('src/components/portal-jamaah/hooks/usePortalTheme.ts');
  assert.match(src, /localStorage\.getItem\(['"]portalDarkMode['"]\)/);
  assert.match(src, /classList\.toggle\(['"]dark['"]/);
  assert.match(src, /prefers-color-scheme/);
  assert.match(src, /export function usePortalTheme/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js`
Expected: FAIL — `usePortalTheme.ts` not yet created.

- [ ] **Step 3: Create the hook**

```typescript
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'portalDarkMode';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function applyDarkClass(isDark: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
}

export function usePortalTheme() {
  const [isDark, setIsDark] = useState<boolean>(readInitial);

  useEffect(() => {
    applyDarkClass(isDark);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(isDark));
    }
  }, [isDark]);

  return {
    isDark,
    toggle: () => setIsDark((prev) => !prev),
    setDark: setIsDark,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "usePortalTheme"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/hooks/usePortalTheme.ts tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add usePortalTheme dark mode hook"
```

---

## Task 3: Route enum + navigation hook (`usePortalRoute`)

**Files:**
- Create: `src/components/portal-jamaah/hooks/usePortalRoute.ts`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test for route enum**

Append to `tests/portal-jamaah-redesign.test.js`:

```javascript
test('usePortalRoute: exposes 7 route IDs + navigation helpers', () => {
  const src = read('src/components/portal-jamaah/hooks/usePortalRoute.ts');
  for (const id of ['beranda', 'perjalanan', 'pembayaran', 'dokumen', 'perlengkapan', 'manasik', 'faq']) {
    assert.match(src, new RegExp(`['"]${id}['"]`), `route ${id} missing`);
  }
  assert.match(src, /export type PortalRoute/);
  assert.match(src, /export function usePortalRoute/);
  assert.match(src, /navigate/);
  assert.match(src, /goBack/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "usePortalRoute"`
Expected: FAIL.

- [ ] **Step 3: Create the hook**

```typescript
import { useCallback, useEffect, useState } from 'react';

export type PortalRoute =
  | 'beranda'
  | 'perjalanan'
  | 'pembayaran'
  | 'dokumen'
  | 'perlengkapan'
  | 'manasik'
  | 'faq';

export function usePortalRoute(initial: PortalRoute = 'beranda') {
  const [route, setRoute] = useState<PortalRoute>(initial);

  const navigate = useCallback((next: PortalRoute) => {
    setRoute(next);
  }, []);

  const goBack = useCallback(() => {
    setRoute('beranda');
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  return { route, navigate, goBack };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "usePortalRoute"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/hooks/usePortalRoute.ts tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add usePortalRoute navigation hook"
```

---

## Task 4: Menu config (`portalMenu.ts`)

**Files:**
- Create: `src/components/portal-jamaah/lib/portalMenu.ts`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test for menu config**

Append to `tests/portal-jamaah-redesign.test.js`:

```javascript
test('portalMenu: 6 menus with semantic colors and lucide icons', () => {
  const src = read('src/components/portal-jamaah/lib/portalMenu.ts');
  assert.match(src, /export const PORTAL_MENUS/);
  // 6 menus expected — verify each route id appears
  for (const id of ['perjalanan', 'pembayaran', 'dokumen', 'perlengkapan', 'manasik', 'faq']) {
    assert.match(src, new RegExp(`id:\\s*['"]${id}['"]`), `menu ${id} missing`);
  }
  // Color tokens per spec
  assert.match(src, /from-emerald-400/);
  assert.match(src, /from-sky-400/);
  assert.match(src, /from-amber-400/);
  assert.match(src, /from-violet-400/);
  assert.match(src, /from-purple-400/);
  assert.match(src, /from-rose-400/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "portalMenu"`
Expected: FAIL.

- [ ] **Step 3: Create menu config**

```typescript
import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, CreditCard, FileText, LifeBuoy, Package, Plane } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';

export interface PortalMenu {
  id: Exclude<PortalRoute, 'beranda'>;
  label: string;
  desc: string;
  icon: LucideIcon;
  iconBg: string;
  cardBg: string;
  cardBorder: string;
  iconShadow: string;
}

export const PORTAL_MENUS: PortalMenu[] = [
  {
    id: 'perjalanan',
    label: 'Perjalanan',
    desc: 'Flight & hotel',
    icon: Plane,
    iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-600 dark:from-emerald-500 dark:to-teal-700',
    cardBg: 'bg-gradient-to-br from-emerald-50 via-white to-teal-100/70 dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-emerald-200/70 dark:border-emerald-800/40',
    iconShadow: 'shadow-lg shadow-emerald-500/30 dark:shadow-emerald-900/40',
  },
  {
    id: 'pembayaran',
    label: 'Pembayaran',
    desc: 'Cicilan & bukti',
    icon: CreditCard,
    iconBg: 'bg-gradient-to-br from-sky-400 to-indigo-600 dark:from-sky-500 dark:to-indigo-700',
    cardBg: 'bg-gradient-to-br from-sky-50 via-white to-indigo-100/70 dark:from-sky-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-sky-200/70 dark:border-sky-800/40',
    iconShadow: 'shadow-lg shadow-sky-500/30 dark:shadow-sky-900/40',
  },
  {
    id: 'dokumen',
    label: 'Dokumen',
    desc: 'Paspor, visa, dll',
    icon: FileText,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500 dark:from-amber-500 dark:to-orange-600',
    cardBg: 'bg-gradient-to-br from-amber-50 via-white to-orange-100/70 dark:from-amber-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-amber-200/70 dark:border-amber-800/40',
    iconShadow: 'shadow-lg shadow-amber-500/30 dark:shadow-amber-900/40',
  },
  {
    id: 'perlengkapan',
    label: 'Perlengkapan',
    desc: 'Koper, ihram, dll',
    icon: Package,
    iconBg: 'bg-gradient-to-br from-violet-400 to-purple-600 dark:from-violet-500 dark:to-purple-700',
    cardBg: 'bg-gradient-to-br from-violet-50 via-white to-purple-100/70 dark:from-violet-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-violet-200/70 dark:border-violet-800/40',
    iconShadow: 'shadow-lg shadow-violet-500/30 dark:shadow-violet-900/40',
  },
  {
    id: 'manasik',
    label: 'Manasik',
    desc: 'Jadwal & spiritual',
    icon: BookOpenCheck,
    iconBg: 'bg-gradient-to-br from-purple-400 to-fuchsia-600 dark:from-purple-500 dark:to-fuchsia-700',
    cardBg: 'bg-gradient-to-br from-fuchsia-50 via-white to-purple-100/70 dark:from-purple-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-purple-200/70 dark:border-purple-800/40',
    iconShadow: 'shadow-lg shadow-purple-500/30 dark:shadow-purple-900/40',
  },
  {
    id: 'faq',
    label: 'FAQ',
    desc: 'Pertanyaan umum',
    icon: LifeBuoy,
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600 dark:from-rose-500 dark:to-pink-700',
    cardBg: 'bg-gradient-to-br from-rose-50 via-white to-pink-100/70 dark:from-rose-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-rose-200/70 dark:border-rose-800/40',
    iconShadow: 'shadow-lg shadow-rose-500/30 dark:shadow-rose-900/40',
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "portalMenu"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/lib/portalMenu.ts tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add portal menu config"
```

---

## Task 5: Smart alerts logic (`portalAlerts.ts`)

**Files:**
- Create: `src/components/portal-jamaah/lib/portalAlerts.ts`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append to `tests/portal-jamaah-redesign.test.js`:

```javascript
test('portalAlerts: deriveAlerts returns max 2 alerts in priority order', () => {
  const src = read('src/components/portal-jamaah/lib/portalAlerts.ts');
  assert.match(src, /export function deriveAlerts/);
  assert.match(src, /export interface PortalAlert/);
  assert.match(src, /payment|pembayaran/i);
  assert.match(src, /dokumen/i);
  assert.match(src, /perlengkapan/i);
  assert.match(src, /manasik/i);
  // Max 2 sliced
  assert.match(src, /slice\(\s*0\s*,\s*2\s*\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "portalAlerts"`
Expected: FAIL.

- [ ] **Step 3: Create the alerts util**

```typescript
import type { LucideIcon } from 'lucide-react';
import { AlarmClock, BookOpenCheck, FileText, Package } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';
import type { PortalJamaah, PortalMeData } from '../hooks/usePortalMe';
import { daysUntilDate } from '../utils/formatDate';

export type AlertTone = 'red' | 'amber' | 'violet' | 'purple';

export interface PortalAlert {
  id: string;
  title: string;
  subtitle: string;
  tone: AlertTone;
  icon: LucideIcon;
  navigateTo: PortalRoute;
}

const CRITICAL_DOC_KEYS = ['paspor', 'visa', 'vaksin'];

function totalSisa(jamaah: PortalJamaah[]) {
  return jamaah.reduce((sum, item) => sum + Number(item.sisa || 0), 0);
}

function hasMissingCriticalDoc(jamaah: PortalJamaah[]): boolean {
  return jamaah.some((j) => {
    const text = JSON.stringify(j.dokumen || {}).toLowerCase();
    return CRITICAL_DOC_KEYS.some((key) => !text.includes(key) || text.includes(`${key}_belum_siap`));
  });
}

function hasUntakenEquipment(jamaah: PortalJamaah[]): boolean {
  return jamaah.some((j) => Object.values(j.perlengkapan || {}).some((p) => p?.status !== 'diambil'));
}

export function deriveAlerts(data: PortalMeData): PortalAlert[] {
  const alerts: PortalAlert[] = [];
  const daysLeft = Number(data.booking.hari_ke_berangkat ?? daysUntilDate(data.booking.tgl_berangkat) ?? 999);
  const sisa = totalSisa(data.jamaah);

  if (daysLeft <= 30 && sisa > 0) {
    alerts.push({
      id: 'payment-overdue',
      title: 'Pembayaran belum lunas',
      subtitle: `H-${daysLeft} ke keberangkatan, sisa belum lunas`,
      tone: 'red',
      icon: AlarmClock,
      navigateTo: 'pembayaran',
    });
  }

  if (daysLeft <= 60 && hasMissingCriticalDoc(data.jamaah)) {
    alerts.push({
      id: 'doc-incomplete',
      title: 'Dokumen belum lengkap',
      subtitle: 'Lengkapi paspor, visa, atau vaksin meningitis',
      tone: 'amber',
      icon: FileText,
      navigateTo: 'dokumen',
    });
  }

  if (daysLeft <= 14 && hasUntakenEquipment(data.jamaah)) {
    alerts.push({
      id: 'equipment-untaken',
      title: 'Perlengkapan belum diambil',
      subtitle: 'Hubungi agent untuk ambil koper & ihram',
      tone: 'violet',
      icon: Package,
      navigateTo: 'perlengkapan',
    });
  }

  if (data.schedule?.manasik_tgl) {
    const manasikDaysLeft = daysUntilDate(data.schedule.manasik_tgl);
    if (manasikDaysLeft !== null && manasikDaysLeft <= 7 && manasikDaysLeft >= 0) {
      alerts.push({
        id: 'manasik-soon',
        title: 'Manasik dalam 7 hari',
        subtitle: `Jadwal manasik H-${manasikDaysLeft}`,
        tone: 'purple',
        icon: BookOpenCheck,
        navigateTo: 'manasik',
      });
    }
  }

  return alerts.slice(0, 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "portalAlerts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/lib/portalAlerts.ts tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add smart alerts derivation"
```

---

## Task 6: Task list logic (`portalTasks.ts`)

**Files:**
- Create: `src/components/portal-jamaah/lib/portalTasks.ts`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('portalTasks: derives top 3 pending tasks with category mapping', () => {
  const src = read('src/components/portal-jamaah/lib/portalTasks.ts');
  assert.match(src, /export function deriveTopTasks/);
  assert.match(src, /export type TaskCategory/);
  assert.match(src, /slice\(\s*0\s*,\s*3\s*\)/);
  assert.match(src, /pembayaran|dokumen|perlengkapan|manasik/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "portalTasks"`
Expected: FAIL.

- [ ] **Step 3: Create the tasks util**

```typescript
import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, CheckCircle, CreditCard, FileText, Package } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';
import type { PortalPersiapanData, PortalPersiapanItem } from '../hooks/usePortalPersiapan';

export type TaskCategory = 'pembayaran' | 'dokumen' | 'perlengkapan' | 'manasik' | 'fallback';

export interface PortalTask {
  id: string;
  title: string;
  subtitle: string;
  category: TaskCategory;
  icon: LucideIcon;
  navigateTo: PortalRoute;
}

function categoryFor(item: PortalPersiapanItem): TaskCategory {
  const id = item.id?.toLowerCase() || '';
  const title = item.title?.toLowerCase() || '';
  const haystack = `${id} ${title}`;
  if (/bayar|pembayaran|lunas/.test(haystack)) return 'pembayaran';
  if (/dokumen|paspor|visa|vaksin|foto/.test(haystack)) return 'dokumen';
  if (/perlengkapan|koper|ihram|mukena/.test(haystack)) return 'perlengkapan';
  if (/manasik|spiritual|doa|niat|hafalan/.test(haystack)) return 'manasik';
  return 'fallback';
}

const ICON_MAP: Record<TaskCategory, LucideIcon> = {
  pembayaran: CreditCard,
  dokumen: FileText,
  perlengkapan: Package,
  manasik: BookOpenCheck,
  fallback: CheckCircle,
};

const ROUTE_MAP: Record<TaskCategory, PortalRoute> = {
  pembayaran: 'pembayaran',
  dokumen: 'dokumen',
  perlengkapan: 'perlengkapan',
  manasik: 'manasik',
  fallback: 'beranda',
};

export function deriveTopTasks(persiapan: PortalPersiapanData | null): PortalTask[] {
  if (!persiapan?.tahapan) return [];
  return persiapan.tahapan
    .filter((item) => !item.checked)
    .slice(0, 3)
    .map((item) => {
      const category = categoryFor(item);
      return {
        id: item.id,
        title: item.title,
        subtitle: item.description || 'Persiapan keberangkatan',
        category,
        icon: ICON_MAP[category],
        navigateTo: ROUTE_MAP[category],
      };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "portalTasks"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/lib/portalTasks.ts tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add task derivation util"
```

---

## Task 7: FAQ content (`faq.ts`)

**Files:**
- Create: `src/components/portal-jamaah/lib/faq.ts`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('faq: exports 8 FAQ entries with question + answer', () => {
  const src = read('src/components/portal-jamaah/lib/faq.ts');
  assert.match(src, /export const PORTAL_FAQ/);
  // Count question entries (each entry has a 'question:' field)
  const matches = src.match(/question:\s*['"]/g) || [];
  assert.equal(matches.length, 8, `expected 8 FAQ entries, got ${matches.length}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "faq:"`
Expected: FAIL.

- [ ] **Step 3: Create FAQ content**

```typescript
export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export const PORTAL_FAQ: FaqEntry[] = [
  {
    id: 'cara-bayar',
    question: 'Bagaimana cara melakukan pembayaran?',
    answer: 'Pembayaran dilakukan via transfer bank ke rekening resmi agent yang tercantum di menu Pembayaran. Setelah transfer, kirim bukti ke agent lewat tombol WhatsApp untuk dikonfirmasi. Cantumkan kode booking pada berita transfer.',
  },
  {
    id: 'dokumen-wajib',
    question: 'Apa saja dokumen yang perlu disiapkan?',
    answer: 'Paspor (masa berlaku minimal 7 bulan dari tanggal berangkat), Visa Umroh, Sertifikat Vaksin Meningitis, KTP, Kartu Keluarga (KK), dan foto 4x6 latar putih. Detail status tiap dokumen bisa dilihat di menu Dokumen.',
  },
  {
    id: 'deadline-pelunasan',
    question: 'Kapan deadline pelunasan?',
    answer: 'Deadline pelunasan adalah H-30 sebelum tanggal keberangkatan. Pelunasan tepat waktu penting agar dokumen visa & tiket bisa difinalisasi tanpa hambatan.',
  },
  {
    id: 'manasik-wajib',
    question: 'Apakah manasik wajib dihadiri?',
    answer: 'Sangat dianjurkan. Manasik adalah pembekalan tata cara umroh yang berguna terutama untuk jamaah yang belum pernah umroh. Jadwal manasik tersedia di menu Manasik.',
  },
  {
    id: 'sakit-menjelang-berangkat',
    question: 'Bagaimana kalau saya sakit menjelang berangkat?',
    answer: 'Segera hubungi agent. Tergantung kondisi, agent dapat membantu pengurusan reschedule, refund parsial sesuai kebijakan, atau pengurusan asuransi perjalanan jika tersedia.',
  },
  {
    id: 'berat-koper',
    question: 'Berapa berat koper maksimal yang diperbolehkan?',
    answer: 'Umumnya bagasi 30 kg + tas kabin 7 kg, tergantung maskapai. Detail per penerbangan akan diinfokan agent menjelang keberangkatan. Hindari kelebihan agar tidak kena biaya tambahan.',
  },
  {
    id: 'transfer-jamaah-lain',
    question: 'Apakah pembayaran bisa dialihkan ke jamaah lain?',
    answer: 'Bisa, dengan persetujuan tertulis dari kedua belah pihak dan koordinasi agent. Hubungi agent untuk proses pengalihan resmi.',
  },
  {
    id: 'pembatalan-refund',
    question: 'Bagaimana prosedur pembatalan / refund?',
    answer: 'Pembatalan mengikuti syarat & ketentuan perjanjian booking. Refund parsial dimungkinkan tergantung jarak waktu pembatalan ke tanggal berangkat. Hubungi agent untuk perhitungan resmi.',
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "faq:"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/lib/faq.ts tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add FAQ content"
```

---

## Task 8: `ThemeToggle` component

**Files:**
- Create: `src/components/portal-jamaah/components/ThemeToggle.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('ThemeToggle: renders Sun/Moon icon button with DESIGN-SYSTEM classes', () => {
  const src = read('src/components/portal-jamaah/components/ThemeToggle.tsx');
  assert.match(src, /Moon/);
  assert.match(src, /Sun/);
  assert.match(src, /bg-gray-100\/80 dark:bg-slate-800\/80/);
  assert.match(src, /rounded-xl/);
  assert.match(src, /usePortalTheme/);
  assert.match(src, /active:scale-95/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "ThemeToggle"`
Expected: FAIL.

- [ ] **Step 3: Create component**

```tsx
import { Moon, Sun } from 'lucide-react';
import { usePortalTheme } from '../hooks/usePortalTheme';

export default function ThemeToggle() {
  const { isDark, toggle } = usePortalTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
      className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {isDark ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "ThemeToggle"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/components/ThemeToggle.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add ThemeToggle component"
```

---

## Task 9: `PortalTopBar` redesign

**Files:**
- Modify: `src/components/portal-jamaah/components/PortalTopBar.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test for DESIGN-SYSTEM parity**

Append:

```javascript
test('PortalTopBar: uses DESIGN-SYSTEM classes (backdrop-blur, dark mode, no bell)', () => {
  const src = read('src/components/portal-jamaah/components/PortalTopBar.tsx');
  assert.match(src, /backdrop-blur-md/);
  assert.match(src, /bg-white\/90 dark:bg-slate-900\/90/);
  assert.match(src, /sticky top-0 z-30/);
  assert.match(src, /max-w-lg/);
  assert.doesNotMatch(src, /Bell/, 'dummy bell button must be removed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PortalTopBar"`
Expected: FAIL — current TopBar uses `bg-white` not `bg-white/90 backdrop-blur` and still has `Bell`.

- [ ] **Step 3: Rewrite the component**

Replace contents of `src/components/portal-jamaah/components/PortalTopBar.tsx` with:

```tsx
import type { ReactNode } from 'react';
import type { PortalAgentInfo } from '../hooks/usePortalMe';

function initials(name?: string | null) {
  return (name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';
}

export default function PortalTopBar({
  agent,
  rightSlot,
}: {
  agent: PortalAgentInfo | null;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/90">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {agent?.photo ? (
            <img
              src={agent.photo}
              alt={agent.name}
              className="h-9 w-9 flex-none rounded-full border-2 border-emerald-200 object-cover shadow-sm dark:border-emerald-700"
            />
          ) : (
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-bold text-white shadow-sm">
              {initials(agent?.name)}
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] text-gray-500 dark:text-slate-400">Agent</p>
            <p className="truncate text-sm font-bold text-gray-800 dark:text-white">{agent?.name || 'Alhijaz'}</p>
          </div>
        </div>
        {rightSlot ? <div className="flex flex-none items-center gap-1.5">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PortalTopBar"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/components/PortalTopBar.tsx tests/portal-jamaah-redesign.test.js
git commit -m "refactor(portal): redesign PortalTopBar per DESIGN-SYSTEM with dark mode"
```

---

## Task 10: `PortalBackBar` (sub-page top bar)

**Files:**
- Create: `src/components/portal-jamaah/components/PortalBackBar.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('PortalBackBar: back button + title + sticky header per DESIGN-SYSTEM', () => {
  const src = read('src/components/portal-jamaah/components/PortalBackBar.tsx');
  assert.match(src, /sticky top-0 z-30/);
  assert.match(src, /backdrop-blur-md/);
  assert.match(src, /ChevronLeft/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /onBack/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PortalBackBar"`
Expected: FAIL.

- [ ] **Step 3: Create component**

```tsx
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export default function PortalBackBar({
  title,
  onBack,
  rightSlot,
}: {
  title: string;
  onBack: () => void;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/90">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gray-100/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] text-gray-500 dark:text-slate-400">Halaman</p>
          <p className="truncate text-sm font-bold text-gray-800 dark:text-white">{title}</p>
        </div>
        <div className="flex h-9 w-9 flex-none items-center justify-center">{rightSlot}</div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PortalBackBar"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/components/PortalBackBar.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add PortalBackBar for sub-page navigation"
```

---

## Task 11: `StickyWhatsAppCta` component

**Files:**
- Create: `src/components/portal-jamaah/components/StickyWhatsAppCta.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('StickyWhatsAppCta: fixed bottom, emerald-500, shadow', () => {
  const src = read('src/components/portal-jamaah/components/StickyWhatsAppCta.tsx');
  assert.match(src, /fixed bottom-0/);
  assert.match(src, /z-40/);
  assert.match(src, /bg-emerald-500/);
  assert.match(src, /shadow-lg shadow-emerald-500\/30/);
  assert.match(src, /MessageCircle/);
  assert.match(src, /normalizeWaNumber/);
  assert.match(src, /max-w-lg/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "StickyWhatsAppCta"`
Expected: FAIL.

- [ ] **Step 3: Create component**

```tsx
import { MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import type { PortalAgentInfo, PortalBooking, PortalJamaah } from '../hooks/usePortalMe';

export default function StickyWhatsAppCta({
  agent,
  booking,
  initiator,
}: {
  agent: PortalAgentInfo | null;
  booking: PortalBooking;
  initiator: PortalJamaah | undefined;
}) {
  const phone = normalizeWaNumber(agent?.phone);
  if (!phone) return null;
  const message = `Assalamualaikum ${agent?.name || 'Agent'}, saya ${initiator?.nama || 'jamaah'} dari booking ${booking.id_umroh}. Saya ingin bertanya tentang persiapan perjalanan umroh kami.`;
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-emerald-500 shadow-lg shadow-emerald-500/30 dark:bg-emerald-600">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mx-auto flex w-full max-w-lg items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold text-white"
        style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
      >
        <MessageCircle className="h-5 w-5" strokeWidth={2} />
        <span>Hubungi {agent?.name || 'Agent'} lewat WhatsApp</span>
      </a>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "StickyWhatsAppCta"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/components/StickyWhatsAppCta.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add StickyWhatsAppCta persistent bottom CTA"
```

---

## Task 12: `HeroCountdown` component

**Files:**
- Create: `src/components/portal-jamaah/components/HeroCountdown.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('HeroCountdown: emerald gradient hero with text-6xl countdown', () => {
  const src = read('src/components/portal-jamaah/components/HeroCountdown.tsx');
  assert.match(src, /text-6xl/, 'countdown should be text-6xl');
  assert.match(src, /linear-gradient.*064e3b/i);
  assert.match(src, /Menuju Tanah Suci/i);
  assert.match(src, /rounded-2xl/);
  assert.match(src, /id_umroh/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "HeroCountdown"`
Expected: FAIL.

- [ ] **Step 3: Create component**

```tsx
import type { PortalBooking } from '../hooks/usePortalMe';
import { daysUntilDate, formatLongDate } from '../utils/formatDate';

function airlineFromCode(code?: string | null) {
  const prefix = String(code || '').trim().slice(0, 2).toUpperCase();
  const airlines: Record<string, string> = {
    SV: 'Saudia',
    GA: 'Garuda Indonesia',
    QR: 'Qatar Airways',
    EK: 'Emirates',
    EY: 'Etihad',
    WY: 'Oman Air',
    JT: 'Lion Air',
  };
  return airlines[prefix] || 'Maskapai';
}

export default function HeroCountdown({
  booking,
  flightCode,
}: {
  booking: PortalBooking;
  flightCode: string;
}) {
  const daysFromApi = Number(booking.hari_ke_berangkat);
  const daysLeft = Number.isFinite(daysFromApi) ? daysFromApi : daysUntilDate(booking.tgl_berangkat) ?? 0;
  const safeDays = Math.max(0, daysLeft);
  return (
    <section
      className="rounded-2xl p-6 text-white shadow-sm"
      style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0F6E56 50%, #065f46 100%)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Menuju Tanah Suci</p>
          <p className="mt-3 text-6xl font-bold leading-none tracking-tight">{safeDays}</p>
          <p className="mt-2 text-sm font-semibold text-emerald-100">
            {safeDays === 0 ? 'Hari keberangkatan' : 'hari lagi'}
          </p>
        </div>
        <span className="flex-none rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold tracking-wide text-white backdrop-blur-sm">
          {booking.id_umroh}
        </span>
      </div>
      <p className="mt-5 text-sm font-medium text-emerald-100">Berangkat {formatLongDate(booking.tgl_berangkat)}</p>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/20 pt-5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Paket</p>
          <p className="mt-1 truncate text-sm font-bold">{booking.paket || 'Paket Umroh'}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Penerbangan</p>
          <p className="mt-1 truncate text-sm font-bold">
            {flightCode} · {airlineFromCode(flightCode)}
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "HeroCountdown"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/components/HeroCountdown.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add HeroCountdown component"
```

---

## Task 13: `PortalMenuCard` + `PortalMenuGrid` components

**Files:**
- Create: `src/components/portal-jamaah/components/PortalMenuCard.tsx`
- Create: `src/components/portal-jamaah/components/PortalMenuGrid.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add tests**

Append:

```javascript
test('PortalMenuCard: card with icon badge + label + desc + tap handler', () => {
  const src = read('src/components/portal-jamaah/components/PortalMenuCard.tsx');
  assert.match(src, /w-12 h-12/, 'icon container should be 48x48');
  assert.match(src, /rounded-2xl/);
  assert.match(src, /active:scale-\[0\.97\]/);
  assert.match(src, /text-\[13px\] font-bold/);
  assert.match(src, /text-\[11px\]/, 'desc text size');
  assert.match(src, /hover:-translate-y-0\.5/);
});

test('PortalMenuGrid: 3-col grid wiring PORTAL_MENUS', () => {
  const src = read('src/components/portal-jamaah/components/PortalMenuGrid.tsx');
  assert.match(src, /grid grid-cols-3 gap-3/);
  assert.match(src, /PORTAL_MENUS/);
  assert.match(src, /onNavigate/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PortalMenu"`
Expected: FAIL (both).

- [ ] **Step 3: Create PortalMenuCard**

`src/components/portal-jamaah/components/PortalMenuCard.tsx`:

```tsx
import type { PortalMenu } from '../lib/portalMenu';

export default function PortalMenuCard({
  menu,
  onClick,
}: {
  menu: PortalMenu;
  onClick: () => void;
}) {
  const Icon = menu.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border p-3.5 shadow-sm transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-xl ${menu.cardBg} ${menu.cardBorder}`}
    >
      <div className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl group-hover:opacity-30 ${menu.iconBg}`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent dark:from-white/5" />
      <div className="relative flex flex-col items-center text-center">
        <div className={`mb-2 flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-white/40 transition-transform duration-200 group-hover:scale-110 dark:ring-white/10 ${menu.iconBg} ${menu.iconShadow}`}>
          <Icon size={24} strokeWidth={2} className="text-white" />
        </div>
        <p className="text-[13px] font-bold leading-tight text-gray-800 dark:text-white">{menu.label}</p>
        <p className="mt-0.5 text-[11px] font-medium leading-tight text-gray-500 dark:text-slate-400">{menu.desc}</p>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Create PortalMenuGrid**

`src/components/portal-jamaah/components/PortalMenuGrid.tsx`:

```tsx
import type { PortalRoute } from '../hooks/usePortalRoute';
import { PORTAL_MENUS } from '../lib/portalMenu';
import PortalMenuCard from './PortalMenuCard';

export default function PortalMenuGrid({
  onNavigate,
}: {
  onNavigate: (route: PortalRoute) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {PORTAL_MENUS.map((menu) => (
        <PortalMenuCard key={menu.id} menu={menu} onClick={() => onNavigate(menu.id)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PortalMenu"`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add src/components/portal-jamaah/components/PortalMenuCard.tsx src/components/portal-jamaah/components/PortalMenuGrid.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add PortalMenuCard + PortalMenuGrid"
```

---

## Task 14: `SmartAlertsStrip` component

**Files:**
- Create: `src/components/portal-jamaah/components/SmartAlertsStrip.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('SmartAlertsStrip: renders alerts via deriveAlerts', () => {
  const src = read('src/components/portal-jamaah/components/SmartAlertsStrip.tsx');
  assert.match(src, /deriveAlerts/);
  assert.match(src, /onNavigate/);
  assert.match(src, /ChevronRight/);
  // Tone classes
  assert.match(src, /bg-red-50/);
  assert.match(src, /bg-amber-50/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "SmartAlertsStrip"`
Expected: FAIL.

- [ ] **Step 3: Create component**

```tsx
import { ChevronRight } from 'lucide-react';
import { deriveAlerts, type AlertTone, type PortalAlert } from '../lib/portalAlerts';
import type { PortalMeData } from '../hooks/usePortalMe';
import type { PortalRoute } from '../hooks/usePortalRoute';

const TONE_STYLES: Record<AlertTone, { card: string; iconWrap: string; iconColor: string; title: string; sub: string }> = {
  red: {
    card: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/40',
    iconWrap: 'bg-red-100 dark:bg-red-900/40',
    iconColor: 'text-red-600 dark:text-red-400',
    title: 'text-red-800 dark:text-red-200',
    sub: 'text-red-700 dark:text-red-300',
  },
  amber: {
    card: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/40',
    iconWrap: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-200',
    sub: 'text-amber-700 dark:text-amber-300',
  },
  violet: {
    card: 'bg-violet-50 border-violet-200 dark:bg-violet-900/20 dark:border-violet-800/40',
    iconWrap: 'bg-violet-100 dark:bg-violet-900/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
    title: 'text-violet-800 dark:text-violet-200',
    sub: 'text-violet-700 dark:text-violet-300',
  },
  purple: {
    card: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800/40',
    iconWrap: 'bg-purple-100 dark:bg-purple-900/40',
    iconColor: 'text-purple-600 dark:text-purple-400',
    title: 'text-purple-800 dark:text-purple-200',
    sub: 'text-purple-700 dark:text-purple-300',
  },
};

function AlertRow({ alert, onNavigate }: { alert: PortalAlert; onNavigate: (r: PortalRoute) => void }) {
  const tone = TONE_STYLES[alert.tone];
  const Icon = alert.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(alert.navigateTo)}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.98] ${tone.card}`}
    >
      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${tone.iconWrap}`}>
        <Icon className={`h-5 w-5 ${tone.iconColor}`} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${tone.title}`}>{alert.title}</p>
        <p className={`text-xs ${tone.sub}`}>{alert.subtitle}</p>
      </div>
      <ChevronRight className={`h-5 w-5 flex-none ${tone.iconColor}`} strokeWidth={2} />
    </button>
  );
}

export default function SmartAlertsStrip({
  data,
  onNavigate,
}: {
  data: PortalMeData;
  onNavigate: (route: PortalRoute) => void;
}) {
  const alerts = deriveAlerts(data);
  if (!alerts.length) return null;
  return (
    <div className="space-y-2.5">
      {alerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "SmartAlertsStrip"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/components/SmartAlertsStrip.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add SmartAlertsStrip widget"
```

---

## Task 15: `TaskListWidget` component

**Files:**
- Create: `src/components/portal-jamaah/components/TaskListWidget.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('TaskListWidget: renders deriveTopTasks output + empty-state', () => {
  const src = read('src/components/portal-jamaah/components/TaskListWidget.tsx');
  assert.match(src, /deriveTopTasks/);
  assert.match(src, /Semua persiapan up-to-date/i);
  assert.match(src, /ChevronRight/);
  assert.match(src, /YANG PERLU ANDA LAKUKAN/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "TaskListWidget"`
Expected: FAIL.

- [ ] **Step 3: Create component**

```tsx
import { CheckCircle, ChevronRight } from 'lucide-react';
import { deriveTopTasks, type TaskCategory } from '../lib/portalTasks';
import type { PortalPersiapanData } from '../hooks/usePortalPersiapan';
import type { PortalRoute } from '../hooks/usePortalRoute';

const CATEGORY_STYLES: Record<TaskCategory, { bg: string; color: string }> = {
  pembayaran: { bg: 'bg-sky-50 dark:bg-sky-900/20', color: 'text-sky-600 dark:text-sky-400' },
  dokumen: { bg: 'bg-amber-50 dark:bg-amber-900/20', color: 'text-amber-600 dark:text-amber-400' },
  perlengkapan: { bg: 'bg-violet-50 dark:bg-violet-900/20', color: 'text-violet-600 dark:text-violet-400' },
  manasik: { bg: 'bg-purple-50 dark:bg-purple-900/20', color: 'text-purple-600 dark:text-purple-400' },
  fallback: { bg: 'bg-gray-50 dark:bg-slate-700', color: 'text-gray-600 dark:text-slate-400' },
};

export default function TaskListWidget({
  persiapan,
  onNavigate,
}: {
  persiapan: PortalPersiapanData | null;
  onNavigate: (route: PortalRoute) => void;
}) {
  const tasks = deriveTopTasks(persiapan);

  return (
    <section className="space-y-3">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        YANG PERLU ANDA LAKUKAN
      </h2>
      {tasks.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/20">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Semua persiapan up-to-date</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => {
            const Icon = task.icon;
            const styles = CATEGORY_STYLES[task.category];
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onNavigate(task.navigateTo)}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.98] hover:border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700"
              >
                <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${styles.bg}`}>
                  <Icon className={`h-5 w-5 ${styles.color}`} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{task.title}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-slate-400">{task.subtitle}</p>
                </div>
                <ChevronRight className="h-5 w-5 flex-none text-gray-400 dark:text-slate-500" strokeWidth={2} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "TaskListWidget"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/components/TaskListWidget.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add TaskListWidget"
```

---

## Task 16: `RosterItem` redesign

**Files:**
- Modify: `src/components/portal-jamaah/components/RosterItem.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('RosterItem: gender ring + payment overlay + visual progress bar', () => {
  const src = read('src/components/portal-jamaah/components/RosterItem.tsx');
  assert.match(src, /ring-pink-300/);
  assert.match(src, /ring-blue-300/);
  assert.match(src, /bg-emerald-500/, 'lunas overlay');
  assert.match(src, /bg-blue-500/, 'dp overlay');
  assert.match(src, /bg-amber-500/, 'belum overlay');
  assert.match(src, /h-1\.5 rounded-full/, 'progress bar');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "RosterItem"`
Expected: FAIL.

- [ ] **Step 3: Rewrite RosterItem**

Replace `src/components/portal-jamaah/components/RosterItem.tsx`:

```tsx
import { Check, Clock } from 'lucide-react';
import type { PortalJamaah } from '../hooks/usePortalMe';

type PaymentStatus = 'lunas' | 'dp' | 'belum';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'J';
}

function paymentStatusOf(j: PortalJamaah): PaymentStatus {
  if (Number(j.sisa || 0) <= 0 && Number(j.bayar || 0) > 0) return 'lunas';
  if (Number(j.bayar || 0) > 0) return 'dp';
  return 'belum';
}

const GENDER_RING: Record<string, string> = {
  L: 'ring-blue-300',
  P: 'ring-pink-300',
};

const OVERLAY_BG: Record<PaymentStatus, string> = {
  lunas: 'bg-emerald-500',
  dp: 'bg-blue-500',
  belum: 'bg-amber-500',
};

const PROGRESS_COLOR = (pct: number) =>
  pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';

const PROGRESS_TEXT = (pct: number) =>
  pct >= 80
    ? 'text-emerald-700 dark:text-emerald-400'
    : pct >= 50
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-rose-700 dark:text-rose-400';

export default function RosterItem({
  jamaah,
  progressPct,
}: {
  jamaah: PortalJamaah;
  progressPct: number;
}) {
  const status = paymentStatusOf(jamaah);
  const ring = GENDER_RING[jamaah.jk || ''] ?? 'ring-emerald-200';
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="relative">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700 ring-2 dark:bg-emerald-900/30 dark:text-emerald-200 ${ring}`}>
          {initials(jamaah.nama)}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-slate-800 ${OVERLAY_BG[status]}`}>
          {status === 'lunas' && <Check size={9} strokeWidth={3} className="text-white" />}
          {status === 'dp' && <Clock size={9} strokeWidth={3} className="text-white" />}
          {status === 'belum' && <span className="text-[8px] font-bold text-white">?</span>}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{jamaah.nama}</p>
          {jamaah.is_initiator && (
            <span className="flex-none rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Anda
            </span>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-gray-500 dark:text-slate-400">Persiapan</span>
            <span className={PROGRESS_TEXT(progressPct)}>{progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all ${PROGRESS_COLOR(progressPct)}`}
              style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "RosterItem"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/components/RosterItem.tsx tests/portal-jamaah-redesign.test.js
git commit -m "refactor(portal): redesign RosterItem with gender ring + overlay + bar"
```

---

## Task 17: `BerandaPage` (composes all Beranda widgets)

**Files:**
- Create: `src/components/portal-jamaah/pages/BerandaPage.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('BerandaPage: composes hero + alerts + menu grid + tasks + roster', () => {
  const src = read('src/components/portal-jamaah/pages/BerandaPage.tsx');
  assert.match(src, /PortalTopBar/);
  assert.match(src, /HeroCountdown/);
  assert.match(src, /SmartAlertsStrip/);
  assert.match(src, /PortalMenuGrid/);
  assert.match(src, /TaskListWidget/);
  assert.match(src, /RosterItem/);
  assert.match(src, /ThemeToggle/);
  assert.match(src, /usePortalPersiapan/);
  assert.match(src, /bg-gradient-to-b from-gray-50 to-gray-100/);
  assert.match(src, /max-w-lg/);
  assert.match(src, /pb-24/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "BerandaPage"`
Expected: FAIL.

- [ ] **Step 3: Create page**

```tsx
import { LogOut } from 'lucide-react';
import PortalTopBar from '../components/PortalTopBar';
import ThemeToggle from '../components/ThemeToggle';
import HeroCountdown from '../components/HeroCountdown';
import PortalMenuGrid from '../components/PortalMenuGrid';
import SmartAlertsStrip from '../components/SmartAlertsStrip';
import TaskListWidget from '../components/TaskListWidget';
import RosterItem from '../components/RosterItem';
import type { PortalJamaah, PortalMeData } from '../hooks/usePortalMe';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalRoute } from '../hooks/usePortalRoute';

function includesReadyDocument(dokumen: Record<string, unknown>, keyword: string) {
  const text = JSON.stringify(dokumen || {}).toLowerCase();
  return text.includes(keyword) && !text.includes('belum_siap');
}

function computeJamaahPreparation(jamaah: PortalJamaah): number {
  const paymentScore = Math.max(0, Math.min(100, Number(jamaah.bayar_pct || 0)));
  const passportScore = jamaah.no_paspor || includesReadyDocument(jamaah.dokumen, 'paspor') ? 100 : 0;
  const vaccineScore = includesReadyDocument(jamaah.dokumen, 'vaksin') || includesReadyDocument(jamaah.dokumen, 'meningitis') ? 100 : 0;
  const equipment = Object.values(jamaah.perlengkapan || {});
  const equipmentScore = equipment.length
    ? Math.round((equipment.filter((item) => item?.status === 'diambil').length / equipment.length) * 100)
    : 0;
  return Math.round((paymentScore + passportScore + vaccineScore + equipmentScore) / 4);
}

export default function BerandaPage({
  data,
  onNavigate,
  onLogout,
}: {
  data: PortalMeData;
  onNavigate: (route: PortalRoute) => void;
  onLogout: () => void;
}) {
  const { persiapan } = usePortalPersiapan();
  const initiator = data.jamaah.find((j) => j.is_initiator) || data.jamaah[0];
  const flightCode = data.schedule?.berangkat_kode_penerbangan || 'TBA';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalTopBar
        agent={data.agent}
        rightSlot={
          <>
            <ThemeToggle />
            <button
              type="button"
              onClick={onLogout}
              aria-label="Keluar"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100/80 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
            </button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-lg space-y-6 px-4 pb-24 pt-5">
        <section>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Assalamualaikum,</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {initiator?.jk === 'L' ? 'Bapak ' : initiator?.jk === 'P' ? 'Ibu ' : ''}
            {initiator?.nama || 'Jamaah'}
          </h1>
        </section>

        <HeroCountdown booking={data.booking} flightCode={flightCode} />

        <SmartAlertsStrip data={data} onNavigate={onNavigate} />

        <PortalMenuGrid onNavigate={onNavigate} />

        <TaskListWidget persiapan={persiapan} onNavigate={onNavigate} />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
              ANGGOTA BOOKING
            </h2>
            <span className="text-xs font-bold text-gray-500 dark:text-slate-400">{data.jamaah.length} jamaah</span>
          </div>
          <div className="space-y-2.5">
            {data.jamaah.map((j) => (
              <RosterItem key={j.id} jamaah={j} progressPct={computeJamaahPreparation(j)} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "BerandaPage"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/pages/BerandaPage.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add BerandaPage composing all home widgets"
```

---

## Task 18: `PerjalananPage`

**Files:**
- Create: `src/components/portal-jamaah/pages/PerjalananPage.tsx`
- Modify: `src/components/portal-jamaah/components/FlightCard.tsx` (apply DESIGN-SYSTEM colors)
- Modify: `src/components/portal-jamaah/components/HotelCard.tsx` (apply DESIGN-SYSTEM colors)
- Modify: `src/components/portal-jamaah/components/ItineraryList.tsx` (apply DESIGN-SYSTEM colors)
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test for page**

Append:

```javascript
test('PerjalananPage: emerald hero + FlightCard + HotelCard + ItineraryList', () => {
  const src = read('src/components/portal-jamaah/pages/PerjalananPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /FlightCard/);
  assert.match(src, /HotelCard/);
  assert.match(src, /ItineraryList/);
  assert.match(src, /linear-gradient.*064e3b/i, 'emerald hero gradient');
  assert.match(src, /max-w-lg/);
  assert.match(src, /pb-24/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PerjalananPage"`
Expected: FAIL.

- [ ] **Step 3: Read existing FlightCard, HotelCard, ItineraryList**

Run:
```bash
cat src/components/portal-jamaah/components/FlightCard.tsx
cat src/components/portal-jamaah/components/HotelCard.tsx
cat src/components/portal-jamaah/components/ItineraryList.tsx
```
Read so you know their props.

- [ ] **Step 4: Update FlightCard with dark mode + DESIGN-SYSTEM colors**

For each className in `FlightCard.tsx`, apply rules:
- `bg-white` → `bg-white dark:bg-slate-800`
- `border-slate-100` / `border-gray-100` → `border-gray-100 dark:border-slate-700`
- `text-slate-` / `text-gray-` → add `dark:text-slate-` counterpart per DESIGN-SYSTEM neutral palette
- `rounded-2xl` keep

Write the updated file preserving existing structure but with dark mode pairs and DESIGN-SYSTEM-compliant tokens. Do not add new sections; only restyle.

- [ ] **Step 5: Update HotelCard with dark mode + DESIGN-SYSTEM colors**

Same restyle rules as Step 4 applied to `HotelCard.tsx`.

- [ ] **Step 6: Update ItineraryList with dark mode + DESIGN-SYSTEM colors**

Same restyle rules.

- [ ] **Step 7: Create PerjalananPage**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Sparkles } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import FlightCard from '../components/FlightCard';
import HotelCard from '../components/HotelCard';
import ItineraryList, { type ItineraryDay } from '../components/ItineraryList';
import type { PortalMeData } from '../hooks/usePortalMe';
import { addDays, formatPortalTime, formatShortDate, tripDurationDays } from '../utils/formatDate';

function airlineFromCode(code?: string | null) {
  const prefix = String(code || '').trim().slice(0, 2).toUpperCase();
  const airlines: Record<string, string> = {
    SV: 'Saudia',
    GA: 'Garuda Indonesia',
    QR: 'Qatar Airways',
    EK: 'Emirates',
    EY: 'Etihad',
    WY: 'Oman Air',
    JT: 'Lion Air',
  };
  return airlines[prefix] || 'Maskapai';
}

function normalizeRoute(route?: string | null) {
  const raw = String(route || '').trim();
  if (!raw) return 'Rute menyusul';
  return raw.replace(/\s*[-–>]\s*/g, ' -> ');
}

function routeNote(route?: string | null) {
  const raw = String(route || '');
  const separators = (raw.match(/[-–>,]/g) || []).length;
  return separators <= 1 ? 'Direct' : 'Transit';
}

function detectRoomType(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('double')) return 'Double';
  if (lower.includes('triple')) return 'Triple';
  if (lower.includes('quad')) return 'Quad';
  return 'Tipe kamar sesuai paket';
}

function detectRoomKey(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('double')) return 'double';
  if (lower.includes('triple')) return 'triple';
  if (lower.includes('quad')) return 'quad';
  return '';
}

function parseHotelName(value: unknown) {
  if (typeof value === 'string') return value.replace(/\s*\([★⭐]\d\)\s*$/u, '').trim() || 'Hotel menyusul';
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return String(obj.hotel || obj.name || obj.nama || 'Hotel menyusul');
  }
  return 'Hotel menyusul';
}

function hotelEntries(paketHotel: unknown, paketName?: string | null) {
  const raw = typeof paketHotel === 'string' ? JSON.parse(paketHotel || '{}') : paketHotel;
  if (!raw || typeof raw !== 'object') return [];
  const root = raw as Record<string, unknown>;
  const roomKey = detectRoomKey(paketName);
  const tier = (roomKey && root[roomKey]) || root[Object.keys(root)[0]];
  if (!tier || typeof tier !== 'object') return [];
  return Object.entries(tier as Record<string, unknown>)
    .filter(([city]) => /madinah|mekkah|makkah/i.test(city))
    .map(([city, value]) => ({
      city: /madinah/i.test(city) ? 'Madinah' : 'Makkah',
      name: parseHotelName(value),
      location: /madinah/i.test(city) ? 'Area Masjid Nabawi' : 'Area Masjidil Haram',
      duration: 'Durasi sesuai itinerary',
      roomType: detectRoomType(paketName),
    }));
}

function extractItineraryDays(raw: unknown, startDate?: string | null): ItineraryDay[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { days?: unknown[] }).days)
      ? (raw as { days: unknown[] }).days
      : [];
  return source.map((item, index) => {
    const day = item as Record<string, unknown>;
    return {
      dayNumber: String(day.dayNumber || day.day || `Hari ${index + 1}`),
      title: String(day.title || day.judul || 'Agenda perjalanan'),
      date: day.date ? String(day.date) : formatShortDate(addDays(startDate, index)),
      location: day.location ? String(day.location) : null,
    };
  });
}

export default function PerjalananPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [fallbackItinerary, setFallbackItinerary] = useState<ItineraryDay[]>([]);
  const schedule = data.schedule;
  const packageName = data.booking.paket || data.booking.jadwal?.jadwal_nama || 'Paket Umroh';
  const departureCode = schedule?.berangkat_kode_penerbangan || 'TBA';
  const returnCode = schedule?.pulang_kode_penerbangan || 'TBA';
  const duration = tripDurationDays(data.booking.tgl_berangkat, data.booking.tgl_pulang);
  const itineraryItems = useMemo(
    () => extractItineraryDays(schedule?.itinerary, data.booking.tgl_berangkat),
    [schedule?.itinerary, data.booking.tgl_berangkat]
  );
  const hotels = useMemo(() => {
    try {
      return hotelEntries(schedule?.paket_hotel, packageName);
    } catch {
      return [];
    }
  }, [schedule?.paket_hotel, packageName]);

  useEffect(() => {
    const jadwalId = data.booking.jadwal?.jadwal_id;
    if (itineraryItems.length || !jadwalId) return;
    let cancelled = false;
    const url = new URL(`/api/itinerary/${encodeURIComponent(String(jadwalId))}`, window.location.origin);
    if (schedule?.itinerary_url) url.searchParams.set('pdfUrl', schedule.itinerary_url);
    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) {
          setFallbackItinerary(extractItineraryDays(json.data, data.booking.tgl_berangkat));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [data.booking.jadwal?.jadwal_id, data.booking.tgl_berangkat, itineraryItems.length, schedule?.itinerary_url]);

  const visibleItinerary = itineraryItems.length ? itineraryItems : fallbackItinerary;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Perjalanan" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        <section
          className="rounded-2xl p-6 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0F6E56 50%, #065f46 100%)' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Paket</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{packageName}</h1>
          <p className="mt-2 text-sm font-medium text-emerald-100">
            {data.booking.jadwal?.year_code || new Date().getFullYear()} · {airlineFromCode(departureCode)}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/20 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Berangkat</p>
              <p className="mt-1 text-sm font-bold">{formatShortDate(data.booking.tgl_berangkat)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Pulang</p>
              <p className="mt-1 text-sm font-bold">{formatShortDate(data.booking.tgl_pulang)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Durasi</p>
              <p className="mt-1 text-sm font-bold">{duration ? `${duration} hari` : 'Menyusul'}</p>
            </div>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Penerbangan</p>
          <div className="space-y-3">
            <FlightCard
              label="Pergi"
              route={normalizeRoute(schedule?.berangkat_rute)}
              code={departureCode}
              time={formatPortalTime(schedule?.berangkat_jam)}
              airline={airlineFromCode(departureCode)}
              note={routeNote(schedule?.berangkat_rute)}
            />
            <FlightCard
              label="Pulang"
              route={normalizeRoute(schedule?.pulang_rute)}
              code={returnCode}
              time={formatPortalTime(schedule?.pulang_jam)}
              airline={airlineFromCode(returnCode)}
              note={routeNote(schedule?.pulang_rute)}
            />
          </div>
        </section>

        <section>
          <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hotel</p>
          {hotels.length ? (
            <div className="space-y-3">
              {hotels.map((hotel) => (
                <HotelCard key={`${hotel.city}-${hotel.name}`} {...hotel} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Detail hotel akan tampil setelah agent merilis paket final.
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Itinerary Harian</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
              <Sparkles className="h-3 w-3" strokeWidth={2} />
              AI-generated
            </span>
          </div>
          <ItineraryList items={visibleItinerary} />
          {schedule?.itinerary_url && (
            <a
              href={schedule.itinerary_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-bold text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <CalendarDays className="h-4 w-4" strokeWidth={2} />
              Buka itinerary lengkap
            </a>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify pass**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PerjalananPage"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/portal-jamaah/pages/PerjalananPage.tsx src/components/portal-jamaah/components/FlightCard.tsx src/components/portal-jamaah/components/HotelCard.tsx src/components/portal-jamaah/components/ItineraryList.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add PerjalananPage + restyle FlightCard/HotelCard/ItineraryList"
```

---

## Task 19: `PembayaranPage`

**Files:**
- Create: `src/components/portal-jamaah/pages/PembayaranPage.tsx`
- Modify: `src/components/portal-jamaah/components/JamaahPaymentCard.tsx` (dark mode + DESIGN-SYSTEM colors)
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('PembayaranPage: blue hero + JamaahPaymentCard + CTAs', () => {
  const src = read('src/components/portal-jamaah/pages/PembayaranPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /JamaahPaymentCard/);
  assert.match(src, /linear-gradient.*1e3a8a/i, 'blue hero');
  assert.match(src, /Cara Transfer/i);
  assert.match(src, /Konfirmasi/i);
  assert.match(src, /max-w-lg/);
  assert.match(src, /pb-24/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PembayaranPage"`
Expected: FAIL.

- [ ] **Step 3: Update JamaahPaymentCard**

Read current file, then apply DESIGN-SYSTEM dark-mode restyle rules (per Task 18 Step 4 rules): every `bg-white` → `bg-white dark:bg-slate-800`, every `border-slate-100`/`border-gray-100` → `border-gray-100 dark:border-slate-700`, every neutral text color gets `dark:` counterpart.

- [ ] **Step 4: Create PembayaranPage**

```tsx
import { useMemo, useState } from 'react';
import { CreditCard, MessageCircle, X } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalBackBar from '../components/PortalBackBar';
import JamaahPaymentCard from '../components/JamaahPaymentCard';
import type { PortalMeData } from '../hooks/usePortalMe';
import { addDays, formatLongDate } from '../utils/formatDate';
import { formatRupiah, formatRupiahFull } from '../utils/formatRupiah';

function paymentTotals(data: PortalMeData) {
  const totalBayar = data.jamaah.reduce((sum, item) => sum + Number(item.bayar || 0), 0);
  const totalSisa = data.jamaah.reduce((sum, item) => sum + Number(item.sisa || 0), 0);
  const totalHarga = totalBayar + totalSisa;
  const bayarPct = totalHarga > 0 ? Math.round((totalBayar / totalHarga) * 100) : 0;
  return { totalBayar, totalSisa, totalHarga, bayarPct };
}

function roomTypeFromPackage(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('double')) return 'Double';
  if (lower.includes('triple')) return 'Triple';
  if (lower.includes('quad')) return 'Quad';
  return 'Tipe kamar sesuai paket';
}

export default function PembayaranPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [showTransfer, setShowTransfer] = useState(false);
  const totals = paymentTotals(data);
  const roomType = roomTypeFromPackage(data.booking.paket);
  const initiator = data.jamaah.find((item) => item.is_initiator) || data.jamaah[0];
  const deadline = addDays(data.booking.tgl_berangkat, -30);
  const agentPhone = normalizeWaNumber(data.agent?.phone);
  const confirmationTemplate = useMemo(
    () => `Assalamualaikum ${data.agent?.name || 'Agent'},
Saya ${initiator?.nama || 'jamaah'}, dari booking ${data.booking.id_umroh}.
Saya mau konfirmasi pembayaran ke rekening:
[ ] Saya sudah transfer Rp ___ pada tanggal ___
[ ] Bukti transfer akan saya kirim setelah ini.

Mohon dicek ya. Terima kasih 🙏`,
    [data.agent?.name, data.booking.id_umroh, initiator?.nama]
  );
  const waLink = agentPhone ? `https://wa.me/${agentPhone}?text=${encodeURIComponent(confirmationTemplate)}` : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Pembayaran" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        <section
          className="rounded-2xl p-6 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #312e81 100%)' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Total Booking</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{formatRupiahFull(totals.totalHarga)}</p>
          <p className="mt-1 text-sm font-medium text-blue-100">
            {data.jamaah.length} jamaah · {roomType}
          </p>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-100">
              <span>Progress pembayaran</span>
              <span className="text-sm font-bold text-white">{totals.bayarPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500" style={{ width: `${totals.bayarPct}%` }} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Dibayar</p>
              <p className="mt-1 text-base font-bold text-emerald-200">{formatRupiah(totals.totalBayar)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Sisa</p>
              <p className="mt-1 text-base font-bold text-amber-200">{formatRupiah(totals.totalSisa)}</p>
            </div>
          </div>
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
            <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Deadline pelunasan H-30</p>
            <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
              Pelunasan disarankan sebelum {formatLongDate(deadline)} agar dokumen keberangkatan bisa final.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Per Jamaah</p>
          <div className="space-y-3">
            {data.jamaah.map((item) => (
              <JamaahPaymentCard key={item.id} jamaah={item} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowTransfer(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition active:scale-95"
          >
            <CreditCard className="h-5 w-5" strokeWidth={2} />
            Cara Transfer / Bayar
          </button>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-bold text-gray-700 transition active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <MessageCircle className="h-5 w-5" strokeWidth={2} />
              Konfirmasi Pembayaran ke {data.agent?.name || 'Agent'}
            </a>
          )}
        </section>
      </main>

      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-4 pb-5 sm:items-center sm:pb-0">
          <section className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">Cara Transfer / Bayar</p>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
                  Gunakan instruksi rekening resmi dari agent. Setelah transfer, kirim bukti lewat tombol konfirmasi WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                aria-label="Tutup"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-300"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 rounded-2xl bg-gray-50 p-4 dark:bg-slate-900">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Kode Booking</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{data.booking.id_umroh}</p>
              <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-slate-400">
                Cantumkan kode booking ini pada berita transfer atau pesan konfirmasi.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify pass**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PembayaranPage"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/portal-jamaah/pages/PembayaranPage.tsx src/components/portal-jamaah/components/JamaahPaymentCard.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add PembayaranPage + restyle JamaahPaymentCard"
```

---

## Task 20: `DokumenPage`

**Files:**
- Create: `src/components/portal-jamaah/pages/DokumenPage.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('DokumenPage: amber-themed, JamaahSelector + 6 dokumen wajib', () => {
  const src = read('src/components/portal-jamaah/pages/DokumenPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /JamaahSelector/);
  for (const doc of ['Paspor', 'Visa', 'Vaksin Meningitis', 'KTP', 'Kartu Keluarga', 'Foto']) {
    assert.match(src, new RegExp(doc));
  }
  assert.match(src, /amber/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "DokumenPage"`
Expected: FAIL.

- [ ] **Step 3: Create page**

```tsx
import { useState } from 'react';
import { Check, Clock, X as XIcon } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import JamaahSelector from '../tabs/persiapan/JamaahSelector';
import type { PortalJamaah, PortalMeData } from '../hooks/usePortalMe';

type DocStatus = 'lengkap' | 'diproses' | 'belum';

interface DocSpec {
  key: string;
  label: string;
  matchKeys: string[];
}

const DOCS: DocSpec[] = [
  { key: 'paspor', label: 'Paspor', matchKeys: ['paspor'] },
  { key: 'visa', label: 'Visa Umroh', matchKeys: ['visa', 'visa_umroh'] },
  { key: 'vaksin', label: 'Vaksin Meningitis', matchKeys: ['vaksin', 'meningitis'] },
  { key: 'ktp', label: 'KTP', matchKeys: ['ktp'] },
  { key: 'kk', label: 'Kartu Keluarga (KK)', matchKeys: ['kk', 'kartu_keluarga'] },
  { key: 'foto', label: 'Foto 4x6 latar putih', matchKeys: ['foto'] },
];

function docStatus(jamaah: PortalJamaah | undefined, spec: DocSpec): DocStatus {
  if (!jamaah) return 'belum';
  const text = JSON.stringify(jamaah.dokumen || {}).toLowerCase();
  if (spec.matchKeys.includes('paspor') && jamaah.no_paspor) return 'lengkap';
  for (const key of spec.matchKeys) {
    if (text.includes(`${key}_belum_siap`)) return 'diproses';
    if (text.includes(key)) return 'lengkap';
  }
  return 'belum';
}

const STATUS_BADGE: Record<DocStatus, { label: string; bg: string; text: string; icon: typeof Check }> = {
  lengkap: {
    label: 'Lengkap',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: Check,
  },
  diproses: {
    label: 'Diproses',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    icon: Clock,
  },
  belum: {
    label: 'Belum',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    icon: XIcon,
  },
};

export default function DokumenPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | undefined>(data.jamaah[0]?.id);
  const selected = data.jamaah.find((j) => j.id === selectedId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Dokumen" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        {data.jamaah.length > 1 && (
          <JamaahSelector jamaah={data.jamaah} selectedId={selectedId} onSelect={setSelectedId} />
        )}

        <section className="space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Dokumen Wajib</p>
          <div className="space-y-2.5">
            {DOCS.map((doc) => {
              const status = docStatus(selected, doc);
              const badge = STATUS_BADGE[status];
              const IconBadge = badge.icon;
              return (
                <div key={doc.key} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{doc.label}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.bg} ${badge.text}`}>
                    <IconBadge className="h-3 w-3" strokeWidth={2.5} />
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Belum punya dokumen tertentu?</p>
          <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
            Hubungi {data.agent?.name || 'agent'} untuk panduan & upload via chat WhatsApp.
          </p>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "DokumenPage"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/pages/DokumenPage.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add DokumenPage with 6 dokumen wajib checklist"
```

---

## Task 21: `PerlengkapanPage`

**Files:**
- Create: `src/components/portal-jamaah/pages/PerlengkapanPage.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('PerlengkapanPage: violet-themed, uses existing PerlengkapanSubTab content', () => {
  const src = read('src/components/portal-jamaah/pages/PerlengkapanPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /JamaahSelector/);
  assert.match(src, /PerlengkapanItem/);
  assert.match(src, /perlengkapan/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PerlengkapanPage"`
Expected: FAIL.

- [ ] **Step 3: Create page**

```tsx
import { useState } from 'react';
import PortalBackBar from '../components/PortalBackBar';
import JamaahSelector from '../tabs/persiapan/JamaahSelector';
import PerlengkapanItem from '../tabs/persiapan/PerlengkapanItem';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalMeData } from '../hooks/usePortalMe';

export default function PerlengkapanPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | undefined>(data.jamaah[0]?.id);
  const { persiapan } = usePortalPersiapan();
  const items = selectedId ? persiapan?.perlengkapan_per_jamaah?.[String(selectedId)] ?? [] : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Perlengkapan" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        {data.jamaah.length > 1 && (
          <JamaahSelector jamaah={data.jamaah} selectedId={selectedId} onSelect={setSelectedId} />
        )}

        <section className="space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Perlengkapan Umroh</p>
          {items.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Daftar perlengkapan belum tersedia. Hubungi agent untuk info ambil.
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => (
                <PerlengkapanItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PerlengkapanPage"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/pages/PerlengkapanPage.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add PerlengkapanPage"
```

---

## Task 22: `ManasikSpiritualPage`

**Files:**
- Create: `src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('ManasikSpiritualPage: purple manasik info + spiritual checklist', () => {
  const src = read('src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /manasik/i);
  assert.match(src, /spiritual/i);
  assert.match(src, /usePortalPersiapan/);
  assert.match(src, /linear-gradient.*581c87/i, 'purple gradient');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "ManasikSpiritualPage"`
Expected: FAIL.

- [ ] **Step 3: Create page**

```tsx
import { BookOpenCheck, MapPin } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import ChecklistItem from '../tabs/persiapan/ChecklistItem';
import { usePortalPersiapan } from '../hooks/usePortalPersiapan';
import type { PortalMeData } from '../hooks/usePortalMe';
import { formatLongDate, formatPortalTime } from '../utils/formatDate';

export default function ManasikSpiritualPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const { persiapan, toggleItem } = usePortalPersiapan();
  const schedule = data.schedule;
  const spiritual = persiapan?.spiritual ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Manasik & Spiritual" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        <section
          className="rounded-2xl p-6 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #581c87 0%, #7c3aed 50%, #6b21a8 100%)' }}
        >
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-purple-100">
            <BookOpenCheck className="h-4 w-4" strokeWidth={2} />
            Jadwal Manasik
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight">
            {schedule?.manasik_tgl ? formatLongDate(schedule.manasik_tgl) : 'Jadwal menyusul'}
          </p>
          {schedule?.manasik_jam && (
            <p className="mt-1 text-sm font-semibold text-purple-100">Pukul {formatPortalTime(schedule.manasik_jam)} WIB</p>
          )}
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-medium text-purple-50 backdrop-blur-sm">
            <MapPin className="h-4 w-4 flex-none" strokeWidth={2} />
            <span>Lokasi: hubungi agent untuk konfirmasi venue</span>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Persiapan Spiritual</p>
          {spiritual.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Checklist spiritual belum tersedia.
            </div>
          ) : (
            <div className="space-y-2">
              {spiritual.map((item) => (
                <ChecklistItem key={item.id} item={item} onToggle={(checked) => toggleItem('spiritual', item.id, checked)} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "ManasikSpiritualPage"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add ManasikSpiritualPage"
```

---

## Task 23: `FaqPage`

**Files:**
- Create: `src/components/portal-jamaah/pages/FaqPage.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('FaqPage: accordion of PORTAL_FAQ + escalation CTA', () => {
  const src = read('src/components/portal-jamaah/pages/FaqPage.tsx');
  assert.match(src, /PortalBackBar/);
  assert.match(src, /PORTAL_FAQ/);
  assert.match(src, /Tidak menemukan jawaban/i);
  assert.match(src, /useState/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "FaqPage"`
Expected: FAIL.

- [ ] **Step 3: Create page**

```tsx
import { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalBackBar from '../components/PortalBackBar';
import { PORTAL_FAQ } from '../lib/faq';
import type { PortalMeData } from '../hooks/usePortalMe';

export default function FaqPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const agentPhone = normalizeWaNumber(data.agent?.phone);
  const escalationLink = agentPhone
    ? `https://wa.me/${agentPhone}?text=${encodeURIComponent(`Assalamualaikum ${data.agent?.name || 'Agent'}, saya ada pertanyaan dari portal jamaah.`)}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="FAQ & Bantuan" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800/40 dark:bg-rose-900/20">
          <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Pertanyaan umum jamaah umroh</p>
          <p className="mt-1 text-xs leading-5 text-rose-700 dark:text-rose-300">
            Cari jawaban cepat di sini. Kalau belum ada, hubungi agent.
          </p>
        </section>

        <div className="space-y-2.5">
          {PORTAL_FAQ.map((entry) => {
            const open = openId === entry.id;
            return (
              <div
                key={entry.id}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : entry.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={open}
                >
                  <span className="flex-1 text-sm font-bold text-gray-900 dark:text-white">{entry.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 flex-none text-gray-400 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
                    strokeWidth={2}
                  />
                </button>
                {open && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 text-sm leading-6 text-gray-700 dark:border-slate-700 dark:text-slate-300">
                    {entry.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {escalationLink && (
          <a
            href={escalationLink}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition active:scale-95"
          >
            <MessageCircle className="h-5 w-5" strokeWidth={2} />
            Tidak menemukan jawaban? Hubungi {data.agent?.name || 'Agent'}
          </a>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "FaqPage"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/pages/FaqPage.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): add FaqPage accordion"
```

---

## Task 24: Update `LogoutMenu` for dark mode

**Files:**
- Modify: `src/components/portal-jamaah/components/LogoutMenu.tsx`

LogoutMenu is still used by handle from BerandaPage. Apply DESIGN-SYSTEM dark mode pairs.

- [ ] **Step 1: Read existing file**

Run: `cat src/components/portal-jamaah/components/LogoutMenu.tsx`

- [ ] **Step 2: Edit each `bg-*`/`border-*`/`text-*` className**

Add `dark:` counterparts per DESIGN-SYSTEM neutral palette mapping (e.g. `bg-white` → `bg-white dark:bg-slate-800`, `border-slate-100` → `border-gray-100 dark:border-slate-700`, `text-slate-700` → `text-gray-700 dark:text-slate-200`).

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-jamaah/components/LogoutMenu.tsx
git commit -m "refactor(portal): add dark mode pairs to LogoutMenu"
```

---

## Task 25: Wire all routes in `PortalDashboard`

**Files:**
- Modify: `src/components/portal-jamaah/pages/PortalDashboard.tsx`
- Modify: `tests/portal-jamaah-redesign.test.js`

- [ ] **Step 1: Add test**

Append:

```javascript
test('PortalDashboard: wires 7 routes + StickyWhatsAppCta + no PortalBottomNav', () => {
  const src = read('src/components/portal-jamaah/pages/PortalDashboard.tsx');
  assert.doesNotMatch(src, /PortalBottomNav/, 'bottom nav removed');
  assert.match(src, /BerandaPage/);
  assert.match(src, /PerjalananPage/);
  assert.match(src, /PembayaranPage/);
  assert.match(src, /DokumenPage/);
  assert.match(src, /PerlengkapanPage/);
  assert.match(src, /ManasikSpiritualPage/);
  assert.match(src, /FaqPage/);
  assert.match(src, /StickyWhatsAppCta/);
  assert.match(src, /usePortalRoute/);
  assert.match(src, /usePortalTheme/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PortalDashboard"`
Expected: FAIL.

- [ ] **Step 3: Rewrite PortalDashboard**

Replace `src/components/portal-jamaah/pages/PortalDashboard.tsx`:

```tsx
import { AlertCircle, Loader2 } from 'lucide-react';
import type { PortalSession } from '../lib/portalSession';
import { usePortalMe } from '../hooks/usePortalMe';
import { usePortalTheme } from '../hooks/usePortalTheme';
import { usePortalRoute } from '../hooks/usePortalRoute';
import { portalApi } from '../lib/portalApi';
import { clearPortalSession } from '../lib/portalSession';
import { clearPortalMeCache } from '../hooks/usePortalMe';
import BerandaPage from './BerandaPage';
import PerjalananPage from './PerjalananPage';
import PembayaranPage from './PembayaranPage';
import DokumenPage from './DokumenPage';
import PerlengkapanPage from './PerlengkapanPage';
import ManasikSpiritualPage from './ManasikSpiritualPage';
import FaqPage from './FaqPage';
import StickyWhatsAppCta from '../components/StickyWhatsAppCta';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 dark:from-slate-900 dark:to-slate-950">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          <Loader2 className="h-8 w-8 animate-spin" strokeWidth={2} />
        </div>
        <p className="mt-4 text-sm font-bold text-gray-700 dark:text-slate-200">Memuat portal jamaah...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 dark:from-slate-900 dark:to-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
          <AlertCircle className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Data belum bisa dimuat</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
          Coba muat ulang. Jika masih gagal, hubungi agent untuk memastikan sesi Anda masih aktif.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20"
        >
          Muat Ulang
        </button>
      </section>
    </div>
  );
}

export default function PortalDashboard({ slug, session }: { slug: string; session: PortalSession }) {
  usePortalTheme();
  const { route, navigate, goBack } = usePortalRoute('beranda');
  const { data, loading, error, refetch } = usePortalMe();

  async function handleLogout() {
    try {
      await portalApi.logout();
    } catch {
      // session may already be gone
    } finally {
      clearPortalMeCache();
      clearPortalSession();
      window.location.href = `/${data?.agent?.slug || slug}/jamaah`;
    }
  }

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen onRetry={refetch} />;
  if (!data) return null;

  const initiator = data.jamaah.find((j) => j.is_initiator) || data.jamaah[0];

  return (
    <div data-agent-slug={slug} data-booking-id={session.id_umroh}>
      {route === 'beranda' && <BerandaPage data={data} onNavigate={navigate} onLogout={handleLogout} />}
      {route === 'perjalanan' && <PerjalananPage data={data} onBack={goBack} />}
      {route === 'pembayaran' && <PembayaranPage data={data} onBack={goBack} />}
      {route === 'dokumen' && <DokumenPage data={data} onBack={goBack} />}
      {route === 'perlengkapan' && <PerlengkapanPage data={data} onBack={goBack} />}
      {route === 'manasik' && <ManasikSpiritualPage data={data} onBack={goBack} />}
      {route === 'faq' && <FaqPage data={data} onBack={goBack} />}
      <StickyWhatsAppCta agent={data.agent} booking={data.booking} initiator={initiator} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "PortalDashboard"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-jamaah/pages/PortalDashboard.tsx tests/portal-jamaah-redesign.test.js
git commit -m "feat(portal): wire 7-route state machine in PortalDashboard"
```

---

## Task 26: Delete obsolete files

**Files to delete:**
- `src/components/portal-jamaah/components/PortalBottomNav.tsx`
- `src/components/portal-jamaah/components/StatusCard.tsx`
- `src/components/portal-jamaah/tabs/BerandaTab.tsx`
- `src/components/portal-jamaah/tabs/PerjalananTab.tsx`
- `src/components/portal-jamaah/tabs/BayarTab.tsx`
- `src/components/portal-jamaah/tabs/PersiapanTab.tsx`
- `src/components/portal-jamaah/tabs/persiapan/PersiapanHeader.tsx`
- `src/components/portal-jamaah/tabs/persiapan/TahapanSubTab.tsx`

- [ ] **Step 1: Verify nothing imports these files outside the files themselves**

Run:
```bash
grep -rn --include='*.tsx' --include='*.ts' "PortalBottomNav\|StatusCard\|tabs/BerandaTab\|tabs/PerjalananTab\|tabs/BayarTab\|tabs/PersiapanTab\|PersiapanHeader\|TahapanSubTab" src/
```
Expected: only self-references within the soon-to-be-deleted files. If anything else references them, fix import first.

- [ ] **Step 2: Delete files**

```bash
rm src/components/portal-jamaah/components/PortalBottomNav.tsx
rm src/components/portal-jamaah/components/StatusCard.tsx
rm src/components/portal-jamaah/tabs/BerandaTab.tsx
rm src/components/portal-jamaah/tabs/PerjalananTab.tsx
rm src/components/portal-jamaah/tabs/BayarTab.tsx
rm src/components/portal-jamaah/tabs/PersiapanTab.tsx
rm src/components/portal-jamaah/tabs/persiapan/PersiapanHeader.tsx
rm src/components/portal-jamaah/tabs/persiapan/TahapanSubTab.tsx
```

- [ ] **Step 3: Verify redesign test "deleted files" assertion passes**

Run: `node --test tests/portal-jamaah-redesign.test.js -t "deleted files"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -u src/components/portal-jamaah/
git commit -m "chore(portal): delete obsolete tab files and PortalBottomNav/StatusCard"
```

---

## Task 27: Update `portal-jamaah-frontend.test.js` for new file structure

**Files:**
- Modify: `tests/portal-jamaah-frontend.test.js`

- [ ] **Step 1: Read existing test**

Run: `cat tests/portal-jamaah-frontend.test.js`

Identify the `files` array(s) and remove the 8 deleted file paths, then add the new page + component + lib + hook paths from this plan.

- [ ] **Step 2: Edit the file list**

Remove from `files` array:
- `src/components/portal-jamaah/tabs/BerandaTab.tsx`
- `src/components/portal-jamaah/tabs/PerjalananTab.tsx`
- `src/components/portal-jamaah/tabs/BayarTab.tsx`
- `src/components/portal-jamaah/tabs/PersiapanTab.tsx`
- `src/components/portal-jamaah/tabs/persiapan/PersiapanHeader.tsx`
- `src/components/portal-jamaah/tabs/persiapan/TahapanSubTab.tsx`
- `src/components/portal-jamaah/components/PortalBottomNav.tsx`
- `src/components/portal-jamaah/components/StatusCard.tsx`

Add to `files` array:
- `src/components/portal-jamaah/hooks/usePortalTheme.ts`
- `src/components/portal-jamaah/hooks/usePortalRoute.ts`
- `src/components/portal-jamaah/lib/faq.ts`
- `src/components/portal-jamaah/lib/portalMenu.ts`
- `src/components/portal-jamaah/lib/portalAlerts.ts`
- `src/components/portal-jamaah/lib/portalTasks.ts`
- `src/components/portal-jamaah/components/ThemeToggle.tsx`
- `src/components/portal-jamaah/components/PortalBackBar.tsx`
- `src/components/portal-jamaah/components/StickyWhatsAppCta.tsx`
- `src/components/portal-jamaah/components/HeroCountdown.tsx`
- `src/components/portal-jamaah/components/PortalMenuCard.tsx`
- `src/components/portal-jamaah/components/PortalMenuGrid.tsx`
- `src/components/portal-jamaah/components/SmartAlertsStrip.tsx`
- `src/components/portal-jamaah/components/TaskListWidget.tsx`
- `src/components/portal-jamaah/pages/BerandaPage.tsx`
- `src/components/portal-jamaah/pages/PerjalananPage.tsx`
- `src/components/portal-jamaah/pages/PembayaranPage.tsx`
- `src/components/portal-jamaah/pages/DokumenPage.tsx`
- `src/components/portal-jamaah/pages/PerlengkapanPage.tsx`
- `src/components/portal-jamaah/pages/ManasikSpiritualPage.tsx`
- `src/components/portal-jamaah/pages/FaqPage.tsx`

- [ ] **Step 3: Run frontend test to verify pass**

Run: `node --test tests/portal-jamaah-frontend.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/portal-jamaah-frontend.test.js
git commit -m "test(portal): update file list for redesigned structure"
```

---

## Task 28: Build + lint + manual UI verification

- [ ] **Step 1: Run full lint**

Run: `npm run lint`
Expected: 0 errors. Fix any lint errors that appear in newly created files.

- [ ] **Step 2: Run TypeScript build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run all test files**

Run: `node --test tests/portal-jamaah-redesign.test.js tests/portal-jamaah-frontend.test.js tests/portal-jamaah.test.js`
Expected: All PASS.

- [ ] **Step 4: Manual UI verification**

Start dev server:
```bash
npm run dev
```

In browser, navigate to `http://localhost:5173/<agent-slug>/jamaah/dashboard` (use a test agent slug; sign in via existing magic link or kode booking flow):

Verify each criterion (acceptance criteria from spec):
1. Beranda renders hero countdown + 6 menu cards + roster + sticky WA
2. Each of 6 menu cards navigates to corresponding sub-page
3. Sub-page back button returns to Beranda
4. Sticky WhatsApp CTA visible at bottom on ALL 7 routes (when agent has phone)
5. Dark mode toggle in top bar switches theme; preference persists across page reload (test by toggling, refreshing browser)
6. Smart alerts appear conditionally (manually inspect with a booking that has unpaid balance + days_left ≤ 30)
7. Task widget shows up to 3 pending tasks from persiapan data
8. FAQ accordion: tap → expand, tap again → collapse
9. No text smaller than 12px visible (zoom browser, inspect computed font sizes on key labels)
10. Touch targets ≥ 44px (inspect height of menu cards, sticky CTA, top bar buttons)
11. No `PortalBottomNav` rendered anywhere

If any verification fails, fix in a follow-up commit before considering done.

- [ ] **Step 5: Final commit if any fixes made**

```bash
git add -A
git commit -m "fix(portal): address manual QA findings"
```

(skip if nothing to fix)

---

## Self-Review (auto-applied during plan write)

**Spec coverage:** All 7 routes covered (Beranda + 6 sub-pages). All Acceptance Criteria mapped: AC#1 → Task 25, AC#2 → Task 26, AC#3 → Task 11, AC#4 → Task 2, AC#5 → covered by manual verification in Task 28. AC#6 → covered by various component touch target choices (w-12 h-12 menu icon, py-3.5 buttons). AC#7 → Task 25 wiring. AC#8 → Task 15 TaskListWidget. AC#9 → Task 23. AC#10 → Task 28. AC#11 → out of scope (Pencil mockup is reference, not asserted in code).

**Placeholder scan:** No "TBD", "TODO", "fill in details". All component code is complete and runnable.

**Type consistency:** `PortalRoute` defined in Task 3 used consistently across Tasks 4 (PORTAL_MENUS.id constrained), Task 5 (deriveAlerts navigateTo), Task 6 (deriveTopTasks navigateTo), Task 13 (PortalMenuGrid prop), Task 14 (SmartAlertsStrip prop), Task 17 (BerandaPage prop), Tasks 18-23 (sub-pages use `onBack: () => void`). `usePortalTheme` returns same shape used in Tasks 8 + 25. `PortalAlert` + `PortalTask` types use `LucideIcon` consistently. `JamaahSelector` props reused from existing `tabs/persiapan/JamaahSelector.tsx` (Tasks 20, 21 pass `jamaah`, `selectedId`, `onSelect` — matches existing signature, verify in Task 20 Step 3 by reading file). `ChecklistItem` props reused from existing `tabs/persiapan/ChecklistItem.tsx` (Task 22 passes `item`, `onToggle` — verify in Task 22 by reading file).

---

## Notes for Implementer

- **Existing utilities reused**: `daysUntilDate`, `formatLongDate`, `formatShortDate`, `formatPortalTime`, `addDays`, `tripDurationDays` from `utils/formatDate.ts`. `formatRupiah`, `formatRupiahFull` from `utils/formatRupiah.ts`. `normalizeWaNumber` from `@/utils/phone.ts`. Don't re-implement.
- **Reused persiapan utility components** (`tabs/persiapan/JamaahSelector`, `ChecklistItem`, `PerlengkapanItem`): if their styling doesn't match DESIGN-SYSTEM after redesign lands, that's a follow-up; **not in scope** for this plan unless TypeScript or runtime errors arise.
- **`usePortalPersiapan`** is called inside both `BerandaPage` (Task 17), `PerlengkapanPage` (Task 21), `ManasikSpiritualPage` (Task 22). Each call mounts an independent listener — this matches existing pattern (current `PersiapanTab` also calls it once). No deduplication needed; the hook's internal cache handles re-fetch.
- **Dark mode default**: First-visit user gets OS preference. Manual toggle overrides and persists.
