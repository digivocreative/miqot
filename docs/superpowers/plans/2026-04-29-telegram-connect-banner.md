# Telegram Connect Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, brand-styled banner to the Dashboard Home that prompts the agent to connect Telegram when not yet connected.

**Architecture:** New self-contained React component `TelegramConnectBanner` that fetches `/api/telegram/status` on mount and on `visibilitychange`. Renders a Telegram-branded gradient banner with a CTA that navigates to `/dashboard/settings/telegram`. Mounted in `DashboardLayout` directly above `<CalendarInsight />`, only visible on the Home tab and only when `connected === false`.

**Tech Stack:** React 18 + TypeScript, TailwindCSS, lucide-react (`Send` icon), existing `getAuthHeaders()` helper from `LoginPage.tsx`.

**Spec:** [`docs/superpowers/specs/2026-04-29-telegram-connect-banner-design.md`](../specs/2026-04-29-telegram-connect-banner-design.md)

---

## File Structure

- **Create:** `src/components/TelegramConnectBanner.tsx` — standalone component, fetches status + renders banner
- **Modify:** `src/components/DashboardLayout.tsx` — import + render banner in Home view, above `CalendarInsight`

No test files: this project has only Node-side tests in `tests/` (e.g. `analytics-maintenance.test.js`), no React component test infra. Verification is via `npm run build` (type/build check) and a manual browser smoke check.

---

## Task 1: Create `TelegramConnectBanner` component

**Files:**
- Create: `src/components/TelegramConnectBanner.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/TelegramConnectBanner.tsx` with the following content:

```tsx
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

interface TelegramStatus {
  connected: boolean;
  chatId: string | null;
  hasCredentials: boolean;
}

interface Props {
  onConnect: () => void;
}

export default function TelegramConnectBanner({ onConnect }: Props) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/telegram/status', { headers: { ...getAuthHeaders() } });
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data) {
          setStatus(json.data);
        } else {
          setStatus(null);
        }
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    fetchStatus();

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchStatus();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!loaded) return null;
  if (!status) return null;
  if (status.connected) return null;

  return (
    <div className="mb-4 rounded-xl border border-white/10 shadow-lg shadow-cyan-500/20 dark:shadow-cyan-500/30 p-4 bg-gradient-to-r from-[#229ED9] to-[#1A7FB5]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <span className="absolute inset-0 rounded-full bg-white/40 animate-ping opacity-50" aria-hidden="true" />
            <div className="relative w-10 h-10 rounded-full bg-white flex items-center justify-center">
              <Send size={18} className="text-[#229ED9]" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Telegram belum terhubung</p>
            <p className="text-xs text-white/80">Aktifkan untuk terima notifikasi keberangkatan jamaah</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onConnect}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-white text-[#229ED9] text-sm font-semibold hover:bg-white/90 active:bg-white/80 transition-colors flex-shrink-0"
        >
          Hubungkan
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the new file**

Run: `npx tsc --noEmit`
Expected: no errors related to `TelegramConnectBanner.tsx`. (Pre-existing errors elsewhere in the project, if any, are out of scope — only verify no new errors mention this file.)

- [ ] **Step 3: Commit**

```bash
git add src/components/TelegramConnectBanner.tsx
git commit -m "feat: add TelegramConnectBanner component"
```

---

## Task 2: Mount the banner in `DashboardLayout`

**Files:**
- Modify: `src/components/DashboardLayout.tsx` (import section + Home view around line 750)

- [ ] **Step 1: Add the import**

Open `src/components/DashboardLayout.tsx`. Find the existing line:

```tsx
import CalendarInsight from './CalendarInsight';
```

Add immediately after it:

```tsx
import TelegramConnectBanner from './TelegramConnectBanner';
```

- [ ] **Step 2: Render the banner above `CalendarInsight`**

In the same file, find this block (around line 749–750):

```tsx
        {/* ── AI Insight Alert Bar ── */}
        <CalendarInsight onNavigate={(tab) => navigateTab(tab as TabId)} />
```

Replace with:

```tsx
        {/* ── Telegram Connect Banner ── */}
        <TelegramConnectBanner
          onConnect={() => {
            navigateTab('settings');
            window.history.replaceState({}, '', '/dashboard/settings/telegram');
          }}
        />

        {/* ── AI Insight Alert Bar ── */}
        <CalendarInsight onNavigate={(tab) => navigateTab(tab as TabId)} />
```

The two-step navigation (navigateTab + replaceState) is needed because `navigateTab('settings')` pushes `/dashboard/settings`, then `replaceState` upgrades the URL to the deep sub-route `/dashboard/settings/telegram`, which `getSettingsTabFromPath()` reads when `SettingsPage` mounts to select the Telegram tab.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat: render TelegramConnectBanner on dashboard home"
```

---

## Task 3: Manual smoke verification

**Files:** none (manual verification only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify "not connected" state**

1. Log in as an agent whose Telegram is **not** linked (or temporarily disconnect via Settings → Telegram → Putuskan).
2. Go to `/dashboard` (Home tab).
3. Confirm the banner appears **above** `CalendarInsight` with: white circular icon (Send), pulsing ring, title "Telegram belum terhubung", subtext "Aktifkan untuk terima notifikasi keberangkatan jamaah", and a white "Hubungkan" button.
4. Confirm gradient is Telegram-blue → darker blue.

- [ ] **Step 3: Verify CTA navigation**

Click "Hubungkan". Expected: navigates to `/dashboard/settings/telegram` with the Telegram sub-tab active in Settings.

- [ ] **Step 4: Verify "connected" hides banner**

From Settings → Telegram, complete the connect flow (or use an already-connected agent). Return to `/dashboard`.
Expected: banner does **not** render. `CalendarInsight` is the topmost element.

- [ ] **Step 5: Verify visibility re-fetch**

With banner visible: open Settings → Telegram in another tab, complete connect, then switch back to the Dashboard tab.
Expected: within a moment of the tab regaining focus, the banner disappears (no manual reload needed).

- [ ] **Step 6: Verify error/non-home behavior**

1. Switch to any non-home tab (e.g. Jamaah, Statistik). Banner must not appear there.
2. (Optional) In DevTools, block `/api/telegram/status`. Reload Home. Banner must not appear (silent failure), and the rest of the page renders normally.

- [ ] **Step 7: Verify dark mode + responsive**

Toggle dark mode — banner colors stay branded (gradient unchanged), shadow visible. Resize viewport to mobile width — button moves to its own full-width row below the icon+text.

- [ ] **Step 8: Final commit (if any tweaks were made during smoke check)**

If any visual tweaks were necessary, commit them:

```bash
git add -p
git commit -m "fix: tweak TelegramConnectBanner per smoke check"
```

Otherwise skip.

---

## Self-Review Notes

- **Spec coverage:** Component+location (Task 1+2), data lifecycle with visibilitychange (Task 1 step 1), render logic for loading/error/connected/disconnected (Task 1 step 1), visual treatment incl. gradient/pulse/responsive/dark mode (Task 1 step 1; Task 3 step 7), CTA navigation to deep route (Task 2 step 2; Task 3 step 3), no dismissal (no dismiss UI present), error silent fail (Task 1 step 1; Task 3 step 6), home-only mount (Task 2 step 2 — banner is rendered inside the Home `<main>` block, not in other tabs).
- **Placeholders:** none.
- **Type consistency:** `TelegramStatus` matches `/api/telegram/status` shape used elsewhere (`DashboardProfile.tsx:58`). Prop `onConnect: () => void` is the only public API.
