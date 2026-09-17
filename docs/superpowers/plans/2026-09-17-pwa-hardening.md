# PWA Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every finding of the 2026-09-17 PWA audit (install size, eager JS, update flow, offline, iOS standalone chrome, navigation, error states, install UX) without regressing existing flows.

**Architecture:** Service-worker behaviour stays in `vite.config.ts` (vite-plugin-pwa generateSW) but its pure pieces (chunk routing, route matchers, navigation denylist, install scope) move to small, unit-tested modules. Runtime PWA behaviour (update prompt, stuck-SW repair, offline banner, theme-color, unsaved-work guard, history-aware back, back-to-close overlays) lives in `src/lib/pwa/*` + `src/components/pwa/*`, mounted once from `src/main.tsx`. UI surfaces consume those helpers; no component invents its own variant.

**Tech Stack:** React 18, Vite 4, vite-plugin-pwa 1.2 (Workbox 7), Tailwind 3, Express 5 (`server.js`), node:test.

**Spec:** audit findings summarised in memory `project_pwa_audit.md` (baseline numbers) and the audit report of 2026-09-17.

## Global Constraints

- Commit directly on `main`; run `git branch --show-current` before every commit; `git add` file by file, never `-A`.
- Subagents never run git commands that change state.
- Measure builds with `NODE_ENV=production npx vite build --outDir <scratch>` (repo `.env` sets NODE_ENV=development → React DEV build otherwise). Never build into `dist/` of the repo.
- Tests: `node --test tests/<file>.test.js` per touched area (suite has pre-existing reds; the user runs the full suite/e2e).
- Guard tests that match source text: when behaviour intentionally changes, re-anchor to the NEW invariant and prove it with a mutation (break the code → test red), never just loosen the regex.
- UI copy is Indonesian, short, says what happened + what to do. No raw `Error.message` shown to users.
- Touch targets ≥ 44×44 CSS px (hit area; visual size may stay).
- iOS 26 renders standalone web apps edge-to-edge regardless of `apple-mobile-web-app-status-bar-style` and `viewport-fit` (verified in Simulator) → every fixed/sticky top chrome needs `env(safe-area-inset-top)`, bottom chrome needs `env(safe-area-inset-bottom)`.
- Do not touch `src/lib/kloterLanding.js` imports in `src/main.tsx` (parallel task moves kloter data out of the entry chunk).

---

### Task 1: Chunking + service-worker config

**Files:**
- Create: `src/lib/pwa/buildConfig.js` (pure: `manualChunkFor(id)`, `PRECACHE_GLOB_PATTERNS`, `PRECACHE_GLOB_IGNORES`, `NAVIGATE_FALLBACK_DENYLIST`, route matchers)
- Create: `public/offline.html`
- Modify: `vite.config.ts` (VitePWA block + `build.rollupOptions.output.manualChunks`)
- Modify: `src/components/PackageCard.tsx:2483` (mount ItineraryModal only after first open)
- Test: `tests/pwa-build-config.test.js`
- Modify: `tests/no-blank-hardening.test.js` (denylist anchors)

**Interfaces (Produces):**
- `manualChunkFor(id: string): string | undefined` — react/react-dom/scheduler/tslib/@babel/runtime/vite preload helper/commonjsHelpers → `'vendor-react'`; existing groups unchanged.
- `isAgentPhotoImage({ request, url }): boolean`, `isSameOriginImage({ request, url, sameOrigin }): boolean`, `isHashedAsset({ url, sameOrigin }): boolean`, `isFontRequest({ url, sameOrigin }): boolean`, `isNavigation({ request }): boolean` — self-contained arrow functions (Workbox serialises them with `toString()`; no outer references).
- Denylist keeps `/\/umroh\/?$/`, `/\/haji\/?$/`, `/\/bio\/?$/`, `/^\/bio\/?$/`, adds file-extension paths, narrows `brosur`/`itinerary` to top-level file prefixes, drops `/dashboard`, `/login`, `/jamaah`.

- [ ] Write failing tests for chunk routing, matchers and denylist (dashboard allowed, `/26SEP2026/itinerary` allowed, `/itinerary/x.pdf` denied, `/bagas/umroh` denied, `/haji-plus.html` denied).
- [ ] Implement `buildConfig.js`; wire into `vite.config.ts`: `registerType: 'prompt'`, remove `skipWaiting`, keep `clientsClaim`, precache = shell only, runtime caches (assets, fonts, images, agent-photos, hotel-media), NetworkOnly navigation route with `precacheFallback: { fallbackURL: '/offline.html' }`, `includeAssets` without missing files.
- [ ] PackageCard: `const [itineraryMounted, setItineraryMounted] = useState(false)`; set true whenever `isItineraryOpen` becomes true; render modal only when mounted.
- [ ] Build to scratch; assert entry chunk imports no `vendor-pdf-*`/`vendor-leaflet-*`, precache ≤ 3 MB on the wire, `/bagas` no longer fetches PDF chunks before the modal opens.
- [ ] Commit.

### Task 2: Manifest identity, install scope, icons

**Files:**
- Create: `src/lib/installScope.js` (`resolveInstallStart(pathname): string | null`, `isValidInstallStart(start): boolean`)
- Create: `scripts/generate-pwa-icons.mjs`, `public/icon-maskable-192x192.png`, `public/icon-maskable-512x512.png`, `public/screenshots/*.webp`
- Modify: `vite.config.ts` manifest (`id`, `lang: 'id'`, no orientation lock, white theme, maskable icons, shortcuts, screenshots)
- Modify: `server.js` (`GET /app.webmanifest?start=` before static; `isSharedStaticRequestPath` passes it)
- Modify: `index.html` (remove blob-manifest script; bypass regex only umroh/haji + file prefixes)
- Modify: `src/main.tsx` (swap manifest link to `/app.webmanifest?start=…` on PWA hosts)
- Delete: `public/manifest.webmanifest` (shadowed by the generated one)
- Test: `tests/install-scope.test.js`, update `tests/no-blank-hardening.test.js`

- [ ] Failing tests: `/` → null; `/login`, `/dashboard/teras/post/x`, `/f/abc`, `/j/abc` → null; `/bagas` and `/bagas/JBU1504/itinerary` → `/bagas`; `/bagas/jamaah/abc12/dashboard` → `/bagas/jamaah`; `/26SEP2026/doa` → `/26SEP2026`; invalid chars → null.
- [ ] Implement + server endpoint (reads `dist/manifest.webmanifest` by mtime, overrides `id`/`start_url`, drops `shortcuts`, `Cache-Control: public, max-age=3600`).
- [ ] Generate maskable icons (logo inside 80% safe zone) and screenshots (generic `/` narrow ×2, wide ×1; no personal data).
- [ ] Verify with CDP `Page.getAppManifest` per route + iOS Simulator Add-to-Home-Screen URL.
- [ ] Commit.

### Task 3: Update flow, stuck-SW repair, unsaved-work guard

**Files:**
- Create: `src/lib/pwa/updateStore.ts` (tiny store: `getUpdateState()`, `subscribeUpdate(fn)`, `markUpdateReady(apply)`, `applyUpdate()`)
- Create: `src/lib/pwa/versionCheck.ts` (`decideVersionAction(input): 'none' | 'wait' | 'prompt' | 'repair'`, `runVersionCheck()`)
- Create: `src/lib/unsavedChanges.ts` (`setUnsaved(key, dirty)`, `hasUnsavedChanges()`, `useUnsavedChanges(key, dirty)`, beforeunload guard)
- Create: `src/components/pwa/UpdateToast.tsx`
- Modify: `src/main.tsx` (prompt-mode `registerSW`, version check without wiping runtime caches, `/` → `/dashboard` via `replaceState`, LoginRouter resumes session only on a standalone cold launch)
- Test: `tests/pwa-version-check.test.js`, `tests/unsaved-changes.test.js`, update `tests/auth-session-guard.test.js` only if an anchor moves (keep its invariants)

- [ ] Failing tests for the decision table and the dirty registry.
- [ ] Implement; repair = unregister + delete only `workbox-precache-*` caches, then prompt (never auto-reload).
- [ ] Toast: "Versi baru tersedia" + "Muat ulang"; confirm when `hasUnsavedChanges()`.
- [ ] Harness: deploy mid-session → no automatic reload, toast visible, typed text kept; re-download ≤ 1 MB.
- [ ] Commit.

### Task 4: Offline + error UX foundations

**Files:**
- Create: `src/lib/loadError.ts` (`describeLoadError(err, { online }): string`) + `tests/load-error.test.js`
- Create: `src/components/pwa/OfflineBanner.tsx`, `src/components/pwa/PwaStatusLayer.tsx` (mounts UpdateToast + OfflineBanner)
- Create: `src/lib/pwa/themeColor.ts` (`themeColorFor(isDark)`, `startThemeColorSync()`)
- Create: `src/lib/appHistory.ts` (`pushAppState`, `replaceAppState`, `canGoBackInApp`, `backOr`) + `src/hooks/useBackToClose.ts`
- Modify: `src/index.css` (safe-area + 44px hit-area utilities), `index.html` (`theme-color` #ffffff)

- [ ] Failing tests for `describeLoadError` (offline, timeout/abort, HTTP 5xx, 404, unknown) and `appHistory` depth logic.
- [ ] Implement; mount `PwaStatusLayer` from `main.tsx` in its own error boundary.
- [ ] Commit.

### Task 5 (parallel, file-partitioned): apply foundations to UI surfaces

Each subagent owns only its files; all use the helpers from Tasks 3–4.

- **5A Public pages:** `src/App.tsx`, `src/components/FilterHeader.tsx`, `src/components/KalkulasiPage.tsx`, `src/components/ComparePage.tsx`, `src/components/FloatingAgentBar.tsx`, `src/components/FilterModal.tsx`, `src/services/data-service.ts` — friendly errors, single-package error vs not-found, stale-data note, kalkulasi error + retry, safe-area top/bottom, 44px hit areas, history-aware back.
- **5B Dashboard:** `src/components/DashboardLayout.tsx`, `src/constants/dashboard-chrome.ts` + its consumers, `UpcomingSchedule.tsx`, `JamaahPage.tsx`, `BirthdayDetailSheet.tsx`, `BirthdayListSheet.tsx`, `HotelAgentGallery.tsx`, `LandingPagePage.tsx`, `StatistikPage.tsx`, `DashboardProfile.tsx`, `UmrahRegisterPage.tsx`, `JamaahEditPage.tsx`, `HotelKelolaPage.tsx`, `bio-editor/sheets/SheetBase.tsx`, `FlightStatusCard.tsx`, `VoiceOverPage.tsx`, `SimulasiHajiPlus.tsx`, `InstallAppCard.tsx` (new) — safe-area headers + sticky offsets, back via `backOr`, `useUnsavedChanges` on forms, no `[]` caching on error, offline ≠ login form, install card, download-only exports get a share-sheet fallback and delayed `revokeObjectURL`.
- **5C Pilgrim pages:** `src/components/portal-jamaah/**`, `src/components/KloterLandingPage.tsx`, `src/components/kloter/**`, `src/components/itinerary/SharePage.tsx` — session in localStorage, refetch keeps data, offline copy in consume page, safe-area bars, history-aware back, error vs "belum tersedia", checklist load error.
- **5D Overlays:** `ItineraryModal.tsx`, `BrochureModal.tsx`, `KalkulasiResultModal.tsx`, `ShareKursModal.tsx`, `HajiPage.tsx`, `MediaViewerModal.tsx`, `HotelFilterSheet.tsx`, `AskAIModal.tsx` — `useBackToClose`, safe-area on top controls/footers.

- [ ] Dispatch 5A–5D; review each diff; run touched tests; commit per partition.

### Task 6: Verification

- [ ] Production build to scratch; re-run audit harness scenarios (first visit size, eager chunks, offline agent launch, deploy mid-session, multi-tab, manifest per route, bio single load).
- [ ] Chromium with `Emulation.setSafeAreaInsetsOverride` (top 62, bottom 34): screenshots of public, kloter, dashboard, portal shells.
- [ ] iOS Simulator standalone: header clear of status bar, top buttons tappable.
- [ ] Manual checklist for the user (real Android + iPhone, install, deploy toast).
- [ ] Update memory `project_pwa_audit.md`.
