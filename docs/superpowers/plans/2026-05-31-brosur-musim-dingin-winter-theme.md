# Brosur "Musim Dingin" Winter Theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the brosur jadwal with a blue/icy "Winter Wonderland" theme when the user selects the **Umroh Musim Dingin** filter, while every other filter stays pixel-identical to today's red/gold brochure.

**Architecture:** Introduce a `variant: 'default' | 'winter'` prop on `BrochureScheduleTemplate`. All brand-chrome colors are grouped into a `BrochureTheme` token object; `CLASSIC_THEME` maps every token to the exact current hex (zero regression), `WINTER_THEME` supplies blues. Winter-only decorations (SVG snowflakes, snow drift, tagline ribbon) are gated behind `variant === 'winter'`. `BrochureSchedulePage` computes `isWinter` from the existing filter state and passes the variant to both the preview and the export node.

**Tech Stack:** React + TypeScript, inline-styled component, exported to JPG via `modern-screenshot` (DOM→canvas). No test runner exists in this repo and the spec confirms there is no brosur test infra — so automated gates are `npx tsc --noEmit` (typecheck) + `npm run lint`, plus `npm run build` once at the end, and **manual visual verification** is the acceptance check. Do not add a test framework.

**Spec:** `docs/superpowers/specs/2026-05-31-brosur-musim-dingin-winter-theme-design.md`

---

## File Structure

- **Modify** `src/components/BrochureScheduleTemplate.tsx`
  - Add `variant` to `BrochureScheduleTemplateProps`.
  - Add `BrochureTheme` interface, `CLASSIC_THEME`, `WINTER_THEME`, `getTheme()` near the existing color constants (~line 112–130).
  - Inside the component, derive `const theme = getTheme(variant)` and replace inline brand-color references with `theme.*` tokens.
  - Add winter-only decorations (snowflakes, drift, ribbon) gated on `variant === 'winter'`.
- **Modify** `src/components/BrochureSchedulePage.tsx`
  - Compute `isWinter` and pass `variant` to both `BrochureScheduleTemplate` instances (preview ~line 902, export ~line 969).

No other files. No backend, API, or filter-logic changes. The brand PNG assets (`/logo-alhijaz-besar.png`, `/img-brosur/pasti-umrah.png`) are **not** recolored.

**Note on scope of tokenization:** Only the red/gold brand family + background/pattern/landmark-tint are tokenized. Deliberately left as-is in both variants (per spec — they don't read as "red" and recoloring them is out of scope): `INK` text, white, sold-out grays, package-pill colors (`#7A4F12`, `#0F766E`, etc.), the `#1D9BF0` verified-check badge, and the very-low-opacity neutral drop-shadows on the table container (line ~511) and footer (line ~848).

---

## Task 1: Theme tokens + `variant` prop (zero regression for classic)

**Files:**
- Modify: `src/components/BrochureScheduleTemplate.tsx`

This task adds the theme infrastructure and rewires every inline brand-color usage to tokens. `CLASSIC_THEME` reuses the existing constants 1:1, so the non-winter render is byte-for-byte unchanged. `WINTER_THEME` is defined now but stays dormant until Task 3 wires the page.

- [ ] **Step 1: Add `variant` to the props interface**

In `BrochureScheduleTemplateProps` (ends at line 51), add the prop after `showFullDate`:

Find:
```tsx
  showFullDate?: boolean;
}
```
Replace:
```tsx
  showFullDate?: boolean;
  /**
   * Visual theme. 'winter' switches the brand-chrome palette to icy blue and
   * enables winter-only decorations (snowflakes, drift, ribbon). Defaults to
   * 'default' (the classic red/gold brochure). See CLASSIC_THEME / WINTER_THEME.
   */
  variant?: 'default' | 'winter';
}
```

- [ ] **Step 2: Add the theme types and objects**

The existing color constants are at lines 112–129. Keep them (they remain the source of classic values and are still used directly by the module-scope pill definitions). Insert the theme block immediately **after** line 129 (`const NABAWI_WIDE_IMAGE = '/img-brosur/nabawi-wide.png';`) and **before** `const TABLE_COLUMNS` (line 130).

Find:
```tsx
const NABAWI_WIDE_IMAGE = '/img-brosur/nabawi-wide.png';
const TABLE_COLUMNS = '104px 444px 88px 140px 172px';
```
Replace:
```tsx
const NABAWI_WIDE_IMAGE = '/img-brosur/nabawi-wide.png';

// Winter palette (Direction B — "Winter Wonderland"). Tunable; values mirror the
// approved visual-companion mockup.
const W_NAVY_DARK = '#172554';
const W_NAVY = '#1E3A8A';
const W_BLUE = '#1D4ED8';
const W_BLUE_BRIGHT = '#2563EB';
const W_SKY = '#7DD3FC';
const W_FROST = '#BFDBFE';
const W_FROST_2 = '#CFE0FB';

// Winter geometric pattern: same paths as ISLAMIC_PATTERN_BG but blue strokes.
const WINTER_PATTERN_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%232563EB' stroke-opacity='.30' stroke-width='2'%3E%3Cpath d='M60 6 75 45 114 60 75 75 60 114 45 75 6 60 45 45Z'/%3E%3Cpath d='M60 24 72 60 60 96 48 60Z'/%3E%3Ccircle cx='60' cy='60' r='18'/%3E%3Cpath d='M24 24 45 45M96 24 75 45M96 96 75 75M24 96 45 75'/%3E%3C/g%3E%3Cg fill='none' stroke='%231E3A8A' stroke-opacity='.30' stroke-width='1.5'%3E%3Cpath d='M0 60h120M60 0v120'/%3E%3C/g%3E%3C/svg%3E\")";

const WINTER_CANVAS_BACKGROUND = [
  'radial-gradient(circle at 50% 14%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0) 44%)',
  'radial-gradient(ellipse at 50% 103%, rgba(191,219,254,0.55) 0%, rgba(207,224,251,0.4) 42%, rgba(247,251,255,0) 76%)',
  'linear-gradient(180deg, #CFE0FB 0%, #EAF2FF 28%, #F7FBFF 60%, #E3EDFF 100%)',
].join(', ');

interface BrochureTheme {
  canvasBackground: string;   // full-page background
  topBar: string;             // 10px accent bar at the very top
  patternUrl: string;         // geometric pattern data-URI
  landmarkFilter: string;     // APPENDED to each landmark img's existing filter ('' = classic)
  paketUmrohColor: string;    // "PAKET UMROH" text
  paketUmrohShadow: string;   // textShadow on "PAKET UMROH"
  titleShadowColor: string;   // offset duplicate layer behind the big title
  titleOutline: string;       // 7px outer stroke on the big title
  titleGradient: string;      // fill gradient of the big title
  titleStroke: string;        // 2px inner stroke on the big title
  titleDropShadow: string;    // drop-shadow filter on the big title
  headerDivider: string;      // gradient line under the logo
  urlPillBorder: string;      // border of the URL pill
  urlPillText: string;        // URL pill text color
  tableBorder: string;        // table outer border
  tableHeader: string;        // table header row gradient
  rowLine: string;            // row separators
  badgeGradient: string;      // date badge gradient (non-sold-out)
  badgeBorder: string;        // date badge border
  dayCountColor: string;      // "HARI" number (non-sold-out)
  priceColor: string;         // price + "Jt" + "Hubungi kami"
  footnoteBg: string;         // truncation footnote background
  footnoteText: string;       // truncation footnote text
  footnoteDivider: string;    // dashed divider above footnote
  footerGradient: string;     // agent footer pill gradient
  footerBorder: string;       // agent footer pill border
  avatarBorder: string;       // border ring around agent photo
  footerLabel: string;        // "Info & Pendaftaran:" + agent name accent
}

// CLASSIC = exact current values → non-winter render is unchanged.
const CLASSIC_THEME: BrochureTheme = {
  canvasBackground: CANVAS_BACKGROUND,
  topBar: `linear-gradient(90deg, ${DARK_RED} 0%, ${BRAND_RED} 42%, #F0445F 62%, ${BRAND_RED} 100%)`,
  patternUrl: ISLAMIC_PATTERN_BG,
  landmarkFilter: '',
  paketUmrohColor: BRAND_RED,
  paketUmrohShadow: '0 4px 0 rgba(248,223,161,0.65)',
  titleShadowColor: PALE_GOLD,
  titleOutline: PALE_GOLD,
  titleGradient: `linear-gradient(180deg, #FF5A70 0%, ${BRAND_RED} 34%, #A4001D 68%, ${DARK_RED} 100%)`,
  titleStroke: DEEP_RED,
  titleDropShadow: 'drop-shadow(0 2px 0 rgba(255,255,255,0.38)) drop-shadow(0 11px 15px rgba(90,0,16,0.18))',
  headerDivider: `linear-gradient(90deg, ${BRAND_RED} 0%, ${PALE_GOLD} 48%, rgba(200,16,46,0) 100%)`,
  urlPillBorder: PALE_GOLD,
  urlPillText: DEEP_RED,
  tableBorder: ROW_LINE,
  tableHeader: `linear-gradient(90deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
  rowLine: ROW_LINE,
  badgeGradient: `linear-gradient(145deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
  badgeBorder: PALE_GOLD,
  dayCountColor: DEEP_RED,
  priceColor: DEEP_RED,
  footnoteBg: CREAM,
  footnoteText: DEEP_RED,
  footnoteDivider: GOLD,
  footerGradient: `linear-gradient(135deg, ${DARK_RED} 0%, ${DEEP_RED} 44%, ${BRAND_RED} 100%)`,
  footerBorder: PALE_GOLD,
  avatarBorder: PALE_GOLD,
  footerLabel: PALE_GOLD,
};

const WINTER_THEME: BrochureTheme = {
  canvasBackground: WINTER_CANVAS_BACKGROUND,
  topBar: `linear-gradient(90deg, ${W_NAVY_DARK} 0%, ${W_BLUE_BRIGHT} 55%, ${W_SKY} 100%)`,
  patternUrl: WINTER_PATTERN_BG,
  landmarkFilter: ' grayscale(0.4) sepia(1) hue-rotate(178deg) saturate(1.9) brightness(1.05)',
  paketUmrohColor: W_NAVY,
  paketUmrohShadow: '0 4px 0 rgba(255,255,255,0.7)',
  titleShadowColor: W_FROST_2,
  titleOutline: '#FFFFFF',
  titleGradient: `linear-gradient(180deg, #60A5FA 0%, ${W_BLUE} 38%, ${W_NAVY} 72%, ${W_NAVY_DARK} 100%)`,
  titleStroke: W_NAVY,
  titleDropShadow: 'drop-shadow(0 2px 0 rgba(255,255,255,0.6)) drop-shadow(0 11px 15px rgba(23,37,84,0.18))',
  headerDivider: `linear-gradient(90deg, ${W_BLUE_BRIGHT} 0%, ${W_FROST} 48%, rgba(37,99,235,0) 100%)`,
  urlPillBorder: W_FROST,
  urlPillText: W_NAVY,
  tableBorder: W_FROST_2,
  tableHeader: `linear-gradient(90deg, ${W_NAVY_DARK} 0%, ${W_BLUE_BRIGHT} 100%)`,
  rowLine: '#E5EDFB',
  badgeGradient: `linear-gradient(145deg, ${W_NAVY} 0%, ${W_BLUE_BRIGHT} 100%)`,
  badgeBorder: '#FFFFFF',
  dayCountColor: W_BLUE,
  priceColor: W_BLUE,
  footnoteBg: '#EAF2FF',
  footnoteText: W_NAVY,
  footnoteDivider: W_BLUE_BRIGHT,
  footerGradient: `linear-gradient(135deg, ${W_NAVY_DARK} 0%, ${W_NAVY} 45%, ${W_BLUE_BRIGHT} 100%)`,
  footerBorder: W_FROST,
  avatarBorder: W_FROST,
  footerLabel: W_FROST,
};

function getTheme(variant: 'default' | 'winter'): BrochureTheme {
  return variant === 'winter' ? WINTER_THEME : CLASSIC_THEME;
}

const TABLE_COLUMNS = '104px 444px 88px 140px 172px';
```

- [ ] **Step 3: Destructure `variant` and derive `theme`**

Find (line 295):
```tsx
export function BrochureScheduleTemplate({ month, agent, showFullDate = false }: BrochureScheduleTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
```
Replace:
```tsx
export function BrochureScheduleTemplate({ month, agent, showFullDate = false, variant = 'default' }: BrochureScheduleTemplateProps) {
  const theme = getTheme(variant);
  const photo = agent.photo || avatarFallback(agent.name);
```

- [ ] **Step 4: Verify it compiles before touching the render body**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0. (`WINTER_THEME`/`getTheme` may be reported as unused by lint but TS compiles; that resolves as you wire tokens below.)

- [ ] **Step 5: Rewire the canvas, top bar, pattern, and landmark filters**

Background — find (line 319):
```tsx
      background: CANVAS_BACKGROUND,
```
Replace:
```tsx
      background: theme.canvasBackground,
```

Top accent bar — find (line 333):
```tsx
          background: `linear-gradient(90deg, ${DARK_RED} 0%, ${BRAND_RED} 42%, #F0445F 62%, ${BRAND_RED} 100%)`,
```
Replace:
```tsx
          background: theme.topBar,
```

Both geometric-pattern divs — there are two identical lines (343 and 355):
```tsx
        backgroundImage: ISLAMIC_PATTERN_BG,
```
Replace **both** occurrences with:
```tsx
        backgroundImage: theme.patternUrl,
```

Top-right dome landmark — find (line 372):
```tsx
          filter: 'saturate(0.85)',
```
Replace:
```tsx
          filter: `saturate(0.85)${theme.landmarkFilter}`,
```

Top-left kabah landmark — find (line 387):
```tsx
          filter: 'saturate(0.7)',
```
Replace:
```tsx
          filter: `saturate(0.7)${theme.landmarkFilter}`,
```

Bottom kabah + bottom nabawi — there are two identical lines (808 and 824):
```tsx
            filter: 'saturate(0.62) contrast(0.82) brightness(1.14) drop-shadow(0 18px 34px rgba(90,0,16,0.04))',
```
Replace **both** occurrences with:
```tsx
            filter: `saturate(0.62) contrast(0.82) brightness(1.14) drop-shadow(0 18px 34px rgba(90,0,16,0.04))${theme.landmarkFilter}`,
```

Header divider under the logo — find (line 416):
```tsx
          background: `linear-gradient(90deg, ${BRAND_RED} 0%, ${PALE_GOLD} 48%, rgba(200,16,46,0) 100%)`,
```
Replace:
```tsx
          background: theme.headerDivider,
```

- [ ] **Step 6: Rewire the title block**

"PAKET UMROH" text — find (lines 442–444):
```tsx
          fontSize: 78, fontWeight: 900, lineHeight: 0.92, letterSpacing: 0,
          color: BRAND_RED,
          textShadow: '0 4px 0 rgba(248,223,161,0.65)',
```
Replace:
```tsx
          fontSize: 78, fontWeight: 900, lineHeight: 0.92, letterSpacing: 0,
          color: theme.paketUmrohColor,
          textShadow: theme.paketUmrohShadow,
```

Offset shadow layer behind the big title — find (line 460):
```tsx
            color: PALE_GOLD,
            opacity: 0.95,
```
Replace:
```tsx
            color: theme.titleShadowColor,
            opacity: 0.95,
```

Outer 7px stroke — find (line 468):
```tsx
            WebkitTextStroke: `7px ${PALE_GOLD}`,
```
Replace:
```tsx
            WebkitTextStroke: `7px ${theme.titleOutline}`,
```

Main title span — find (lines 474–480):
```tsx
            color: BRAND_RED,
            backgroundImage: `linear-gradient(180deg, #FF5A70 0%, ${BRAND_RED} 34%, #A4001D 68%, ${DARK_RED} 100%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            WebkitTextStroke: `2px ${DEEP_RED}`,
            filter: 'drop-shadow(0 2px 0 rgba(255,255,255,0.38)) drop-shadow(0 11px 15px rgba(90,0,16,0.18))',
```
Replace:
```tsx
            color: theme.paketUmrohColor,
            backgroundImage: theme.titleGradient,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            WebkitTextStroke: `2px ${theme.titleStroke}`,
            filter: theme.titleDropShadow,
```

URL pill — find (lines 493 and 495):
```tsx
          border: `2px solid ${PALE_GOLD}`,
          boxShadow: '0 9px 25px rgba(90,0,16,0.08)',
          color: DEEP_RED,
```
Replace:
```tsx
          border: `2px solid ${theme.urlPillBorder}`,
          boxShadow: '0 9px 25px rgba(90,0,16,0.08)',
          color: theme.urlPillText,
```

- [ ] **Step 7: Rewire the table**

Table container border — find (line 510):
```tsx
        border: `2px solid ${ROW_LINE}`,
```
Replace:
```tsx
        border: `2px solid ${theme.tableBorder}`,
```

Table header gradient — find (line 520):
```tsx
          background: `linear-gradient(90deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
```
Replace:
```tsx
          background: theme.tableHeader,
```

Row separator — find (line 560):
```tsx
              borderTop: i === 0 ? 'none' : `1px solid ${ROW_LINE}`,
```
Replace:
```tsx
              borderTop: i === 0 ? 'none' : `1px solid ${theme.rowLine}`,
```

Date badge gradient — find (line 570):
```tsx
                  : `linear-gradient(145deg, ${DEEP_RED} 0%, ${BRAND_RED} 100%)`,
```
Replace:
```tsx
                  : theme.badgeGradient,
```

Date badge border — find (line 572):
```tsx
                border: `2px solid ${PALE_GOLD}`,
```
Replace:
```tsx
                border: `2px solid ${theme.badgeBorder}`,
```

Day-count color — find (line 658):
```tsx
                color: isSoldOut ? '#374151' : DEEP_RED,
```
Replace:
```tsx
                color: isSoldOut ? '#374151' : theme.dayCountColor,
```

Price cell — find (lines 757–758) and (line 761). First the two price spans:
```tsx
                    <span style={{ fontSize: 40, color: DEEP_RED, fontWeight: 900, letterSpacing: -0.4 }}>{formatHargaJt(p.harga)}</span>
                    <span style={{ fontSize: 20, color: DEEP_RED, fontWeight: 800 }}> Jt</span>
```
Replace:
```tsx
                    <span style={{ fontSize: 40, color: theme.priceColor, fontWeight: 900, letterSpacing: -0.4 }}>{formatHargaJt(p.harga)}</span>
                    <span style={{ fontSize: 20, color: theme.priceColor, fontWeight: 800 }}> Jt</span>
```
Then the "Hubungi kami" fallback — find (line 761):
```tsx
                  <span style={{ fontSize: 22, color: DEEP_RED, fontWeight: 800 }}>Hubungi kami</span>
```
Replace:
```tsx
                  <span style={{ fontSize: 22, color: theme.priceColor, fontWeight: 800 }}>Hubungi kami</span>
```

Truncation footnote — find (lines 771–772 and 777):
```tsx
            background: CREAM,
            color: DEEP_RED,
            fontWeight: 700,
            fontSize: 20,
            padding: '14px 18px',
            textAlign: 'center',
            borderTop: `1px dashed ${GOLD}`,
```
Replace:
```tsx
            background: theme.footnoteBg,
            color: theme.footnoteText,
            fontWeight: 700,
            fontSize: 20,
            padding: '14px 18px',
            textAlign: 'center',
            borderTop: `1px dashed ${theme.footnoteDivider}`,
```

- [ ] **Step 8: Rewire the footer**

Footer gradient + border — find (lines 841–842):
```tsx
        background: `linear-gradient(135deg, ${DARK_RED} 0%, ${DEEP_RED} 44%, ${BRAND_RED} 100%)`,
        border: `3px solid ${PALE_GOLD}`,
```
Replace:
```tsx
        background: theme.footerGradient,
        border: `3px solid ${theme.footerBorder}`,
```

Avatar ring — find (line 860):
```tsx
              border: `5px solid ${PALE_GOLD}`,
```
Replace:
```tsx
              border: `5px solid ${theme.avatarBorder}`,
```

"Info & Pendaftaran:" label — find (line 883):
```tsx
          <span style={{ fontSize: 24, color: PALE_GOLD, fontWeight: 800, letterSpacing: 0 }}>
```
Replace:
```tsx
          <span style={{ fontSize: 24, color: theme.footerLabel, fontWeight: 800, letterSpacing: 0 }}>
```

- [ ] **Step 9: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: exit 0, no errors. (No `BRAND_RED`/`PALE_GOLD`-unused errors should appear — they're still used by the module-scope pill definitions and by `CLASSIC_THEME`.)

- [ ] **Step 10: Visual regression check (classic must be unchanged)**

Run: `npm run dev`, open `/dashboard/ai-tools/brosur-jadwal`, and confirm the brochure for a normal filter (Bulan, or a non-winter Tipe) looks **exactly** as before — same reds, golds, gradients, shadows. Nothing visual should have changed yet (variant still defaults to 'default').

- [ ] **Step 11: Commit**

```bash
git add src/components/BrochureScheduleTemplate.tsx
git commit -m "refactor(brosur): tokenize brand colors into theme + add variant prop

CLASSIC_THEME maps 1:1 to existing hex (zero regression); WINTER_THEME
defined but dormant until the page wires variant='winter'.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Winter-only decorations (snowflakes, drift, ribbon)

**Files:**
- Modify: `src/components/BrochureScheduleTemplate.tsx`

Add the three winter-only elements. All are gated on `variant === 'winter'`, so the classic render path is untouched. Snowflakes are inline **SVG** (not the `❄` emoji) because emoji glyphs render inconsistently through the `modern-screenshot` JPG export.

- [ ] **Step 1: Add the snowflake data + SVG helper at module scope**

Insert immediately **after** the `getTheme` function added in Task 1 (before `const TABLE_COLUMNS`).

Find:
```tsx
function getTheme(variant: 'default' | 'winter'): BrochureTheme {
  return variant === 'winter' ? WINTER_THEME : CLASSIC_THEME;
}

const TABLE_COLUMNS = '104px 444px 88px 140px 172px';
```
Replace:
```tsx
function getTheme(variant: 'default' | 'winter'): BrochureTheme {
  return variant === 'winter' ? WINTER_THEME : CLASSIC_THEME;
}

// Moderate snow: positions chosen to avoid the package table (which sits roughly
// 560–1180px down the 1620px canvas). Values are in template px on the 1080×1620 art.
interface SnowflakeSpec {
  top?: number; left?: number; right?: number; bottom?: number;
  size: number; color: string; opacity: number; stroke: number;
}
const WINTER_SNOWFLAKES: ReadonlyArray<SnowflakeSpec> = [
  { top: 120, right: 150, size: 64, color: '#BCD9FF', opacity: 0.85, stroke: 1.6 },
  { top: 250, left: 70,  size: 40, color: '#9EC3F5', opacity: 0.8,  stroke: 1.8 },
  { top: 470, right: 110, size: 52, color: '#BCD9FF', opacity: 0.75, stroke: 1.6 },
  { bottom: 360, left: 120, size: 38, color: '#9EC3F5', opacity: 0.8, stroke: 1.8 },
  { bottom: 430, right: 90, size: 46, color: '#BCD9FF', opacity: 0.7, stroke: 1.7 },
  { bottom: 250, left: 220, size: 34, color: '#9EC3F5', opacity: 0.7, stroke: 1.8 },
];

function Snowflake({ spec }: { spec: SnowflakeSpec }) {
  return (
    <svg
      aria-hidden="true"
      width={spec.size}
      height={spec.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={spec.color}
      strokeWidth={spec.stroke}
      strokeLinecap="round"
      style={{
        position: 'absolute',
        top: spec.top, left: spec.left, right: spec.right, bottom: spec.bottom,
        opacity: spec.opacity,
        zIndex: 1,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 1px 2px rgba(80,130,200,0.25))',
      }}
    >
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

const TABLE_COLUMNS = '104px 444px 88px 140px 172px';
```

- [ ] **Step 2: Render snowflakes + drift after the decorative layer**

These go just after the two geometric-pattern divs and landmark images, before the header bar. The header bar comment is the anchor. Find (line 392):
```tsx
      {/* Header bar — uniform 50px insets on all sides */}
```
Replace:
```tsx
      {variant === 'winter' && (
        <>
          {WINTER_SNOWFLAKES.map((spec, i) => (
            <Snowflake key={`flake-${i}`} spec={spec} />
          ))}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 220,
              zIndex: 1,
              pointerEvents: 'none',
              background: 'radial-gradient(130% 100% at 50% 135%, #EEF5FF 42%, rgba(238,245,255,0) 72%)',
            }}
          />
        </>
      )}

      {/* Header bar — uniform 50px insets on all sides */}
```

- [ ] **Step 3: Add the tagline ribbon under the title**

The ribbon sits between the big title and the URL pill. The URL pill `<div>` opens at line 483 (`<div style={{` … containing `{landingUrl}`). Insert the ribbon immediately before it. Find (line 483):
```tsx
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'max-content',
          maxWidth: '100%',
          padding: '8px 20px 9px',
          margin: '5px auto 0',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.78)',
          border: `2px solid ${theme.urlPillBorder}`,
          boxShadow: '0 9px 25px rgba(90,0,16,0.08)',
          color: theme.urlPillText,
          fontSize: 24,
          fontWeight: 900,
          lineHeight: 1,
        }}>
          {landingUrl}
        </div>
```
Replace:
```tsx
        {variant === 'winter' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: 'max-content',
            maxWidth: '100%',
            margin: '12px auto 0',
            padding: '8px 22px 9px',
            borderRadius: 999,
            background: `linear-gradient(90deg, ${W_BLUE_BRIGHT} 0%, ${W_NAVY} 100%)`,
            border: `1px solid ${W_FROST}`,
            boxShadow: '0 8px 20px rgba(30,58,138,0.25)',
            color: '#FFFFFF',
            fontSize: 26,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: 0.3,
          }}>
            <Snowflake spec={{ size: 22, color: '#FFFFFF', opacity: 0.95, stroke: 1.8 }} />
            UMROH SEJUK &amp; NYAMAN
            <Snowflake spec={{ size: 22, color: '#FFFFFF', opacity: 0.95, stroke: 1.8 }} />
          </div>
        )}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'max-content',
          maxWidth: '100%',
          padding: '8px 20px 9px',
          margin: '5px auto 0',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.78)',
          border: `2px solid ${theme.urlPillBorder}`,
          boxShadow: '0 9px 25px rgba(90,0,16,0.08)',
          color: theme.urlPillText,
          fontSize: 24,
          fontWeight: 900,
          lineHeight: 1,
        }}>
          {landingUrl}
        </div>
```

Note: inside the ribbon the inline `Snowflake` uses `position: 'absolute'` from its base style, which would detach it from the flex row. Override by wrapping — adjust the ribbon snowflakes to be inline. Use this corrected ribbon snowflake markup instead of `<Snowflake .../>` above: replace each `<Snowflake spec={{ size: 22, color: '#FFFFFF', opacity: 0.95, stroke: 1.8 }} />` with:
```tsx
            <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.9} strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
            </svg>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/BrochureScheduleTemplate.tsx
git commit -m "feat(brosur): winter-only snowflakes, snow drift, and tagline ribbon

SVG snowflakes (export-safe, not emoji), a soft snow drift at the base, and
an 'Umroh Sejuk & Nyaman' ribbon — all gated on variant==='winter'.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire the page to activate winter for the Musim Dingin filter

**Files:**
- Modify: `src/components/BrochureSchedulePage.tsx`

`TYPE_UMROH_MUSIM_DINGIN` already exists (line 150). Compute `isWinter` and pass `variant` to both template instances so the on-screen preview and the exported JPG always match.

- [ ] **Step 1: Compute `isWinter` in the render body**

The render body has `const previewReady = previewScale > 0;` and `const hasResults = filteredPackages.length > 0;` (lines 804–805). Add `isWinter` next to them. Find:
```tsx
  const previewReady = previewScale > 0;
  const hasResults = filteredPackages.length > 0;
```
Replace:
```tsx
  const previewReady = previewScale > 0;
  const hasResults = filteredPackages.length > 0;
  // Winter brochure theme: only the Tipe Paket → Umroh Musim Dingin filter.
  const brochureVariant: 'default' | 'winter' =
    filterDim === 'tipe' && filterValue === TYPE_UMROH_MUSIM_DINGIN ? 'winter' : 'default';
```

- [ ] **Step 2: Pass `variant` to the preview instance**

Find (line 902):
```tsx
                      <BrochureScheduleTemplate month={page} agent={agent} showFullDate={showFullDate} />
```
Replace:
```tsx
                      <BrochureScheduleTemplate month={page} agent={agent} showFullDate={showFullDate} variant={brochureVariant} />
```

- [ ] **Step 3: Pass `variant` to the export instance**

Find (line 969):
```tsx
            <BrochureScheduleTemplate month={page} agent={agent} showFullDate={showFullDate} />
```
Replace:
```tsx
            <BrochureScheduleTemplate month={page} agent={agent} showFullDate={showFullDate} variant={brochureVariant} />
```

Note: both lines are identical, so apply each edit to its specific instance (preview is inside the visible previews `.map`, export is inside the off-screen `aria-hidden` node). If using a single replace, target each by surrounding context.

- [ ] **Step 4: Typecheck + lint + build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint && npm run build`
Expected: exit 0 for all three.

- [ ] **Step 5: Full manual visual verification**

Run `npm run dev`, open `/dashboard/ai-tools/brosur-jadwal` (need an account whose data has Des/Jan winter packages), then verify:
1. **Winter ON:** Tipe Paket → **Umroh Musim Dingin** → preview shows the blue winter theme (icy background, blue title, blue table header, blue date badges, blue footer), cool-tinted landmarks + pattern, scattered snowflakes, the "UMROH SEJUK & NYAMAN" ribbon, and the snow drift at the base.
2. **Regression:** switch to Bulan / a non-winter Tipe / Maskapai → brochure returns to the **exact** red/gold look. No snow, no ribbon.
3. **Export parity:** with winter active, click **Download** → the saved JPG matches the preview; snowflakes (SVG) and the landmark/pattern tint render correctly (no missing glyphs or boxes).
4. **Multi-page:** if >10 winter packages, every page is consistently winter.
5. **Sold-out row** in winter: the SOLD OUT stamp still renders correctly (sold-out grays are intentionally not themed).

- [ ] **Step 6: Commit**

```bash
git add src/components/BrochureSchedulePage.tsx
git commit -m "feat(brosur): activate winter theme for Umroh Musim Dingin filter

Pass variant='winter' to both the preview and export template instances when
the Tipe Paket = Umroh Musim Dingin filter is selected.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Trigger (filter = Umroh Musim Dingin) → Task 3 ✓
- Theme-token object, CLASSIC 1:1, WINTER blues → Task 1 ✓
- Pattern tinted blue → Task 1 (`WINTER_PATTERN_BG`) ✓
- Landmark cool-tint via filter → Task 1 (`landmarkFilter` appended) ✓
- Kept-the-same items (logo/pasti PNG, pills, sold-out, ink, layout) → untouched; sold-out gray explicitly preserved (Task 1 Step 7) ✓
- Snowflakes as SVG, moderate, avoid table → Task 2 ✓
- Snow drift → Task 2 ✓
- Ribbon "Umroh Sejuk & Nyaman" → Task 2 ✓
- Both preview + export instances themed → Task 3 ✓
- No backend/API/filter changes → confirmed in File Structure ✓
- Verification incl. download parity + regression → Task 3 Step 5 ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact find/replace strings. The only deliberately-flexible values (winter hexes, landmark filter strength, snow opacity) are concrete in the plan and labeled tunable per the spec.

**Type consistency:** `variant: 'default' | 'winter'` is identical in the prop, `getTheme`, and `brochureVariant`. `BrochureTheme` token names used in `CLASSIC_THEME`/`WINTER_THEME` match the `theme.*` references in every render edit. `SnowflakeSpec`/`Snowflake` defined in Task 2 before use. `TYPE_UMROH_MUSIM_DINGIN` is an existing constant (no redefinition).
