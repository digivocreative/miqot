# Portal Jamaah — Total Redesign Spec (Minimalist Modern × Alhijaz)

**Date:** 2026-07-22
**Branch:** `redesign/portal-jamaah-alhijaz`
**Scope:** Full visual redesign of the Portal Jamaah surface (`src/components/portal-jamaah/`, ~56 files) — chrome only; data/logic untouched.

## 1. Context & Goal

Portal Jamaah is a self-service SPA-within-the-SPA for pilgrims, mounted at `/:agentSlug/jamaah/...`, currently styled emerald/green + Inter + pervasive dark mode. The user chose a new design system — **"Minimalist Modern"** personality re-toned to the **Alhijaz brand** (burgundy + gold). Direction was validated over 4 mockups (Beranda + Al-Quran + Pembayaran) in the visual companion.

**Goal:** Restyle the entire portal to the new system, centralizing tokens, introducing reusable primitives, removing dark mode (portal-only), and self-hosting the new fonts — leaving the codebase cleaner and consistent, without changing any data flow, routing, or business logic.

## 2. Design Direction

**Personality:** Minimalist that "breathes" — generous whitespace, one concentrated accent, deep inverted sections, subtle motion. Premium/reassuring, appropriate for a spiritual-travel utility app.

**Signature gradient (accent):** burgundy `#8A0F0A → #C0261C` (from the Alhijaz logo `#6b0906`, lifted for vibrancy + AA contrast).
**Premium accent:** gold `#D4AF37` — reserved, decorative/celebratory only (fails AA as small text → never small body text).
**Inverted panels:** deep-burgundy `#2B0806 → #160403` with a gold/red radial glow (hero countdown, payment summary, surah header).
**Canvas:** warm off-white `#FAF7F5`; body ink `#1E1512`; muted `#F4EEEB` / `#7A6E68`; border `#EAE0DB`.

**Typography (dual-font + mono):**
- Display: **Calistoga** (serif, 400) — Latin headlines, hero numerals, greeting names ONLY.
- Body/UI: **Inter** (already self-hosted) — all body/UI.
- Mono: **JetBrains Mono** (400/500) — section-label pills, money, dates, codes, passport numbers (`tabular-nums`).
- **Arabic: unchanged** — `fontFamily.arabic` (Amiri/Scheherazade system stack). Calistoga/Inter/mono are **never** applied to `font-arabic` / `dir="rtl"` / `lang="ar"` nodes, and no global body font may override `font-arabic`.

**Shape & depth:** generous radius (`rounded-2xl`/`rounded-3xl` + a `lega` token), soft diffused shadows + a burgundy-tinted `shadow-accent`. No hard/offset shadows.

**Motion:** subtle framer-motion (already a dep) entrance/hover + CSS pulse; all continuous motion respects `prefers-reduced-motion`. Additive, done last.

## 3. Locked Decisions (open questions resolved autonomously)

The user authorized full autonomous completion ("selesaikan sampai selesai, jangan tanya apapun"). The mapping synthesis surfaced open decisions; resolved here as the source of truth:

1. **Dark-mode scope = PORTAL-ONLY.** Keep global `darkMode:'class'` (the agent dashboard + public schedule app rely on it — out of scope). Remove dark ONLY within `src/components/portal-jamaah/`: strip all `dark:` variants, and force the portal always-light by neutralizing the theme engine (see §6). Do **not** edit `src/App.tsx`, `src/main.tsx`, or `src/index.css` `.dark` rules (shared foundation).
2. **`colors.primary` green ramp: leave untouched.** Add separate `burgundy` + `gold` tokens. (Portal barely uses `primary-*`; touching it is app-wide blast radius.)
3. **Gold "premium" menu card = Al-Quran.** Exactly one card gets the gold treatment (spiritual centerpiece); the rest are brand-burgundy. Keeps gold meaningful.
4. **Alert severity: keep functional red + amber** for payment-overdue / document tones (comprehension + a11y). Do not flatten all tones to burgundy.
5. **Semantic green kept for success** (Lunas/paid, ≥80% ready). Burgundy = brand, never "success"; danger uses a distinct red (`red-*`), never burgundy.
6. **WhatsApp CTA button stays WhatsApp-green** (brand recognition). Only the surrounding chrome (pill, name, tick) is re-toned.
7. **No `cva` / `tailwind-merge`.** Add a ~12-line local `cn()` helper and express primitive variants as plain Record-of-class-string maps (idiomatic to existing `portalMenu`/`SmartAlertsStrip`). Zero new deps.
8. **Fonts self-hosted** (no Google Fonts CDN). Calistoga 400 + JetBrains Mono 400/500 `.woff2` already downloaded to `public/fonts/brochure/` (`Calistoga-Regular.woff2`, `JetBrainsMono-400.woff2`, `JetBrainsMono-500.woff2`).
9. **External deps:** replace `ui-avatars.com` in `JamaahSelector` with a local initials `Avatar` (low-risk cleanup, on-brand). **Keep** `images.kiwi.com` airline logos in `HeroCountdown` (functional data, not styling — out of scope).
10. **Document status:** restyle both `DokumenPage` (tri-state) and `DokumenSubTab` (binary) via the shared `StatusChip` without merging their distinct logic.

## 4. Token Architecture (`tailwind.config.js`)

Single source of truth = `theme.extend`. Additions (do not remove existing keys):

- `colors.burgundy` ramp: `50 #FCF3F1, 100 #F7E1DE, 200 #ECBBB5, 300 #DE8B82, 400 #CF453B, 500 #C0261C, 600 #A31813, 700 #8A0F0A, 800 #6B0906, 900 #4A0805, 950 #2B0806`. (`700`+`500` = the two gradient stops; `800` = authentic logo; `950` = inverted panel base.)
- `colors.gold`: `{ 50 #FBF6E6, 100 #F5E9C0, DEFAULT #D4AF37, 500 #C9A227, 700 #8A6D12 }` (`gold-700` for the rare gold-as-text case that must pass AA).
- `fontFamily`: ADD `display: ['Calistoga','Georgia','serif']`, `mono: ['"JetBrains Mono"','ui-monospace','monospace']`. KEEP `sans` (Inter) and `arabic`.
- `backgroundImage`: `gradient-burgundy: linear-gradient(135deg,#8A0F0A,#C0261C)`, `gradient-gold: linear-gradient(135deg,#C9A227,#EBCB6B)`, `gradient-ink: linear-gradient(160deg,#2B0806,#160403)`.
- `boxShadow`: `soft: 0 4px 6px rgba(40,10,8,.07)`, `card: 0 10px 15px rgba(40,10,8,.09)`, `accent: 0 4px 14px rgba(138,15,10,.25)`, `accent-lg: 0 8px 24px rgba(138,15,10,.35)`.
- `borderRadius`: `lega: 1.25rem`.
- `darkMode`: **keep `'class'`** (portal forces light at runtime; see §6).
- `colors.primary` (green): **unchanged**.

## 5. Font Strategy

`index.html` (self-host, no CDN — mirror existing `/fonts/brochure/*.woff2` @font-face pattern):
- Add `@font-face` for `Calistoga` 400 → `/fonts/brochure/Calistoga-Regular.woff2`.
- Add `@font-face` for `JetBrains Mono` 400 → `JetBrainsMono-400.woff2`, 500 → `JetBrainsMono-500.woff2`.
- Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for Calistoga 400 (above-the-fold hero display) and JetBrains Mono 400.
- Change `theme-color` meta `#001427 → #8A0F0A`.
- `font-display: swap` throughout.

## 6. Dark-Mode Removal (portal-only)

- **Keep** `tailwind.config.js darkMode:'class'`.
- **Force light in the portal:** replace `usePortalTheme.ts` behavior so it never adds `.dark` and actively removes it on portal mount (so OS-dark users don't get a half-dark portal). Simplest: on mount in `PortalJamaahRouter`, `document.documentElement.classList.remove('dark')`; delete the sessionStorage/matchMedia logic. Keep the hook file as a tiny "force light" effect, or inline it and delete the hook — either is fine; do not leave a toggle.
- **Delete `ThemeToggle.tsx`** and every import/usage (`PortalTopBar`, `BerandaPage` rightSlot, `PortalBackBar` default rightSlot → `null` but KEEP the empty 36px grid cell so titles stay centered, `AgentHeaderBar`).
- **Strip all `dark:` variants** across `src/components/portal-jamaah/` (410 occurrences). `grep -rn "dark:" src/components/portal-jamaah/` must return **0**.
- Dead storage keys (`portalDarkMode`) may remain (harmless).
- **Do NOT touch** `App.tsx` (16), `main.tsx` (12), `index.css` (5 `.dark` selectors) — shared, out of scope.

## 7. Shared Primitives — `src/components/portal-jamaah/ui/`

Plain function components + a local `cn()` helper; variants via Record maps. Public API each subagent must use:

- `cn(...classes)` — falsy-filtering class joiner (in `ui/cn.ts`).
- `Button` — `variant: 'primary' | 'secondary' | 'ghost' | 'wa'` (primary = `bg-gradient-burgundy` text-white shadow-accent + gold hairline; secondary = outline burgundy; ghost; **wa = WhatsApp-green, unchanged brand**); `size: 'sm'|'md'|'lg'` (h-9/12/14); `active:scale-[0.98]`, `transition-all duration-200`. Supports `as`/anchor.
- `Card` — white surface, `rounded-lega`, `shadow-soft`, `border border-black/5`, `p-*` prop. Collapses the ~7 duplicated `rounded-2xl border-gray-100 bg-white shadow-sm` recipes.
- `SectionLabel` — the signature mono pill: `rounded-full border border-burgundy-700/20 bg-burgundy-700/5` + gold/burgundy dot + `font-mono text-[11px] uppercase tracking-[0.15em] text-burgundy-700`. Optional `pulse` dot.
- `StatusChip` — `status: 'success'|'warning'|'danger'|'neutral'|'brand'|'info'` → the ONE soft-chip system backing AlertTone / TaskCategory / STATUS_BADGE / Perlengkapan / payment maps. success=emerald, warning=amber, danger=red, brand=soft-burgundy, neutral=slate, info=gold/neutral. `font-mono` uppercase.
- `GradientText` — `bg-clip-text` burgundy (or `tone="gold"`) for hero numerals / headline keyword.
- `InvertedPanel` — the deep-burgundy shell (`bg-gradient-ink`) with gold radial glow + optional dot texture + optional slow-rotating dashed ring; used by HeroCountdown, Perjalanan/Pembayaran/Surah headers.
- `IconTile` — `w-11 h-11 rounded-xl grid place-items-center`, `tint: 'brand'|'gold'|'neutral'` (brand = `bg-gradient-burgundy` text-white shadow-accent; gold = `bg-gradient-gold` text-ink; neutral = `bg-muted text-burgundy-700`). Menu icons, header/back-bar icon pills, avatar fallbacks.
- `PortalPageShell` — off-white `min-h-screen` mobile column wrapper (`max-w-lg mx-auto`), duplicated in 5+ spots.
- `Avatar` — local initials avatar (burgundy tile) reusing `JamaahPaymentCard.initials()`; replaces `ui-avatars.com`.

## 8. Per-Screen Strategy (see mapping synthesis for file-level notes)

1. **Foundation** — tokens + fonts + `darkMode` kept; `cn` + primitives. Verify build.
2. **Dark-engine removal** — neutralize theme, delete ThemeToggle, unwire.
3. **Beranda shell** (BerandaPage, PortalDashboard, PortalTopBar, PortalBackBar, AgentHeaderBar, RosterItem, StickyWhatsAppCta) — PortalPageShell; light glass headers; roster; WA CTA keeps green button, re-tone chrome.
4. **HeroCountdown** — InvertedPanel gradient-burgundy + gold glow; `{days}` → GradientText + Calistoga; keep Ka'bah SVG + glass tiles; keep kiwi.com airline logos.
5. **Menu grid** (portalMenu.ts, PortalMenuGrid, PortalMenuCard) — collapse 6 hue families → brand IconTile; each entry keeps `{ iconAnim, variant:'brand'|'premium' }`; Al-Quran = `premium` (gold). One commit (data+grid+card together).
6. **Alerts + tasks** (SmartAlertsStrip, TaskListWidget, portalAlerts, portalTasks) — keep enums; rewrite TONE/CATEGORY maps via StatusChip; keep red for payment-critical; empty-state → gold check; headings → SectionLabel.
7. **Data screens** (Perjalanan, Pembayaran, Dokumen + Flight/Hotel/Itinerary/JamaahPaymentCard) — inline hero gradients → `bg-gradient-burgundy`; hero H1 → Calistoga; money/dates/codes/passport → `font-mono tabular-nums`; status → StatusChip (paid=green, remaining=amber, dp/blue→gold/neutral, belum=red); WA green; Cards.
8. **Persiapan sub-tabs** — collapse rainbow categories → brand IconTiles differentiated by icon; StatusChip; done-check keeps success-green, focus ring → burgundy; PhaseSection pulse dot → gold (reduced-motion); ProgressRing arc → burgundy/gold; JamaahSelector → local Avatar.
9. **Arabic content** (AlQuranPage, DoaDzikirPage) — **preserve every `font-arabic` node + `dir=rtl`/`lang=ar` + ARABIC_SIZES leading + the arabic-size stepper**; recolor teal/fuchsia accents → burgundy (interactive/text) + gold (decorative only); surah-header gradient → gradient-burgundy; Calistoga on **Latin** surah/category titles only.
10. **FAQ** — Calistoga on questions/headings; rose banner + emerald CTA → Button primary; keep `focus-visible` ring visible (a11y) but burgundy; uppercase label → SectionLabel; preserve `aria-expanded/controls` + single-open.
11. **Auth/landing** (LandingPage, AuthConsume, AuthError, KodeBookingForm, MagicLinkSuccessCard, Router NotFoundPage) — lean into bold hero; Moon tile → IconTile; headline → Calistoga + GradientText; PortalPageShell + Card; inputs → h-12 `lega`, focus `ring-2 ring-burgundy-700 ring-offset-2` (WA field: apply to the `focus-within` WRAPPER, give it a bg for the offset); keep red error semantics; remove ThemeToggle wiring.
12. **Motion polish** (optional, last) — framer-motion entrance/hover behind `prefers-reduced-motion`.

## 9. Hard Constraints

- **No logic/data/routing changes.** Chrome only. Preserve all props, hooks, enums, `aria-*`, routing, `client_id`/session behavior.
- **Arabic preservation** (see §2, §8.9) — highest-risk regression; guard explicitly.
- **Semantic colors** — success=green, danger=red, warning=amber stay functional; burgundy ≠ success/danger.
- **WhatsApp button** stays WhatsApp-green.
- **`grep -rn "dark:" src/components/portal-jamaah/` == 0** at the end.
- **No new npm deps.**
- **Subagents never run git** (memory: working-tree branch can switch; the controller commits centrally on `redesign/portal-jamaah-alhijaz`, verifying `git branch --show-current` before each commit).

## 10. Verification

- `npm run build:spa` (vite) green — the gate (tsc has ~6 pre-existing errors; build is the FE gate per project convention).
- `grep -rn "dark:" src/components/portal-jamaah/` → 0.
- WCAG AA spot-check: soft-burgundy text on burgundy-50 chips, gold usage is decorative/large only, focus rings visible.
- Visual smoke via the dev server where feasible (portal auth-gated; verify landing + build + mockup parity).
- Final whole-branch code review subagent before hand-off.
- Full e2e/browser suite is the user's to run (per project convention); leave a manual checklist.

## 11. Out of Scope

Data hooks/stores (`doaData`, `faq`, quran API), backend, `App.tsx`/`main.tsx`/`index.css` shared foundation, `colors.primary` green ramp, `images.kiwi.com` airline logos, dashboard-side MagicLink admin tools.
