# Umroh Landing Page — Template-Based Revamp

**Date:** 2026-04-15
**Status:** Approved

## Context

The current umroh landing page (`functions/[slug]/umroh.ts`) generates HTML inline (484 lines of template strings). This approach:
- Uses a hardcoded AGENTS list — new agents (e.g. "yeyen") don't work
- Has no caching — every request re-generates the full page
- Is difficult to update visually — any design change requires code edits

The haji landing page was recently rebuilt using a template-based approach that solves all these issues. This spec applies the same proven pattern to umroh.

## Design

Rewrite `umroh.ts` to read `/public/umroh.html` (367KB Elementor page saved from browser) and apply string replacements, identical to how `haji.ts` works.

### Files to Modify

| File | Action |
|------|--------|
| `functions/[slug]/umroh.ts` | **REWRITE** — template-based, read `/public/umroh.html` |
| `server.js` | **EDIT** — add cache + Supabase agent override to `/:slug/umroh` route |

Files unchanged: `vite.config.ts` (plugin exists), `package.json` (build already compiles umroh.ts).

### umroh.ts — Template Reading

```
Dev (Vite SSR):  fs.readFileSync('../../public/umroh.html')
Prod (Express):  fs.readFileSync (via compiled .mjs, same as haji)
```

### umroh.ts — String Replacements

#### 1. WhatsApp Links (14 occurrences, 7 unique patterns)

Replace all `https://wa.alhijazindonesia.com/?message=...` with `https://api.whatsapp.com/send?phone={agentPhone}&text=...`

Unique message patterns to preserve:
- `Paket Umroh di Alhijaz` (generic)
- `Paket Promo Umroh Hemat 26 Juta-an`
- `Paket Umroh Reguler di Alhijaz`
- `Paket Umroh Plus Thaif di Alhijaz`
- `Paket Umroh Plus Turki di Alhijaz`
- `Paket Umroh Plus Cairo di Alhijaz`
- `Paket Umroh Plus Dubai dan Redsea di Alhijaz`

Strategy: replace the domain+phone part, keep the message text intact.
```
https://wa.alhijazindonesia.com/?message={text}
→ https://api.whatsapp.com/send?phone={phone}&text={text}
```

#### 2. Title & OG Tags

- `<title>` → `Umroh | {agentName} | PT Alhijaz Indowisata`
- `og:title` → same
- `og:image` → `https://alhijaz.co/og/{slug}.png`

#### 3. CSS Cleanup

**Remove (CORS-blocked or unused):**
- `elementor-icons-shared-0-css` (fontawesome.min.css)
- `elementor-icons-fa-brands-css` (brands.min.css)
- `elementor-icons-fa-solid-css` (solid.min.css)
- `elementor-icons-css` (eicons — not used, no `eicon-` classes on page)
- `google-fonts-1-css` (bloated: 5 families, all weights)

**Inject:**
- Font Awesome 5.15.4 `all.min.css` from cdnjs (CORS-friendly)
- Google Fonts: only `Montserrat:wght@500;600;700;800` + `Inter:wght@400;500;600;700` + `display=swap`

**Keep:**
- `elementor/frontend.min.css` (layout)
- `swiper.min.css` (carousel)
- `elementor-pro/frontend.min.css` (pro widgets)
- `landingpress-wp/style.css` (body margin:0, layout resets)
- `e-gallery.min.css` (gallery widget)

#### 4. JS Cleanup

**Remove:**
- `flying-press/vitals.min.js` (analytics)
- `landingpress/script.min.js` (theme JS)
- `lottie.min.js` (animation library — not used)
- Inline: GTM script, Google Ads gtag, Facebook Pixel, Cloudflare challenge, WA link cleaner, Yoast JSON-LD

**Keep:**
- `jquery.min.js` (dependency)
- `webpack-pro.runtime.min.js` + `webpack.runtime.min.js` (module loading)
- `frontend-modules.min.js` (widget functionality)
- `elementor/frontend.min.js` (core renderer)
- `elementor-pro/frontend.min.js` (pro widget init)
- `waypoints.min.js` (scroll triggers)
- `jquery-ui-core.min.js` (Elementor dependency)
- `elements-handlers.min.js` (Swiper carousel init)
- `e-gallery.min.js` (gallery widget)
- `jquery.sticky.min.js` (keep — page may use sticky elements)
- `elementor-pro-frontend-js-before` config (needed for init)
- `elementor-frontend-js-before` config (breakpoint config)

#### 5. Tracking Removal

- `<!-- Google Tag Manager -->` + `<!-- End Google Tag Manager -->` (inline + noscript)
- `<!-- Google tag (gtag.js) -->` + gtag inline script
- `<!-- Facebook Pixel Code -->` + `<!-- End Facebook Pixel Code -->`
- `<meta name="facebook-domain-verification" ...>`
- Cloudflare challenge script
- Yoast JSON-LD schema
- `flying-press-vitals-js-extra` inline config

#### 6. Section Removal

- Footer section with Nikita profile, legalitas, rekening (element `26b2a887`)
- Sticky WA bar "Konsultasi via WA (Fast Response)" (`div.heading-wa`)

#### 7. Other Cleanup

- Remove `<link rel="canonical">` (points to alhijazindonesia.com)
- Remove `<link rel='shortlink'>`
- Remove `<meta name='robots'>`
- Add `loading="lazy"` to images missing it

#### 8. Inject Before `</body>`

- Sticky agent bar (CSS + HTML + JS) — same component as haji.ts
- `padding-bottom: 76px` on `<body>` tag
- Agent photo from Supabase Storage: `https://xicthdsuvmwwuvwvvbqa.supabase.co/storage/v1/object/public/agent-photos/{slug}.jpg`

#### 9. Button Styling

Uniform all WA/CTA buttons:
- `background-color: #28B83C`
- `border-color: #149626`
- `border-radius: 50px`
- `color: #fff`
- Consistent hover: `background-color: #1DA855`

#### 10. Mobile CSS Overrides (`@media max-width: 767px`)

Key font-size reductions:
- Hero "Umroh Pasti Berangkat" 60px → 32px
- Section headings (Profil, Perlengkapan, Dokumentasi, Penghargaan) 46-50px → 24px
- Sub-headings → 14-16px
- Icon box icons 41px → 28px

### Agent Data Integration

```typescript
interface AgentOverride { name?: string; phone?: string; photo?: string; }

async function generateHTML(slug: string, agentOverride?: AgentOverride): Promise<string> {
  const phone = agentOverride?.phone || AGENTS[slug]?.phone || DEFAULT_PHONE;
  const agentName = agentOverride?.name || AGENTS[slug]?.name || capitalizedSlug;
  // ...
}

export const onRequest = async (context) => {
  const agentOverride = context.agentOverride;
  return new Response(await generateHTML(slug, agentOverride), { ... });
};
```

### server.js — Caching + Supabase

Replace current simple route with cached version:

```javascript
const umrohLandingCache = new Map(); // slug → { html, ts }
const UMROH_CACHE_TTL = 3600_000;    // 1 hour

async function generateUmrohPage(slug) {
  const mod = await import('./functions/umroh-landing.mjs');
  const agent = await getAgent(slug); // Supabase
  return await mod.onRequest({
    params: { slug },
    request: new Request(...),
    agentOverride: agent ? { name, phone, photo } : undefined,
  }).then(r => r.text());
}

// Pre-load all agents on startup
// Route: check cache → HIT: serve → MISS: generate, cache, serve
// Header: X-Cache: HIT/MISS
```

## Verification

1. `npm run dev` → visit `http://localhost:5173/nikita/umroh`
2. Page should look identical to https://alhijazindonesia.com/umroh/
3. WA links → agent phone number
4. Title → `Umroh | Nikita | PT Alhijaz Indowisata`
5. Sticky agent bar with photo on scroll
6. Test unknown agent (e.g. `/yeyen/umroh`) — should work with Supabase data
7. No CORS errors for fonts
8. Slider/carousel functional
9. No tracking scripts in source
10. Mobile: font sizes proportional, no giant text
