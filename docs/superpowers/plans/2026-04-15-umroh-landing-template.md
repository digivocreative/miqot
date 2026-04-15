# Umroh Landing Page Template Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite umroh landing page from inline HTML to template-based (read `/public/umroh.html`), matching the haji.ts pattern exactly.

**Architecture:** Read static HTML template at runtime, apply string replacements (WA links, title, og tags, CSS/JS cleanup, mobile overrides), inject sticky agent bar, cache per-agent in memory with Supabase data.

**Tech Stack:** TypeScript (Cloudflare Pages Function), Express.js (server route + cache), esbuild (compile to .mjs)

---

### Task 1: Rewrite `functions/[slug]/umroh.ts`

**Files:**
- Rewrite: `functions/[slug]/umroh.ts`

This is a full rewrite. The new file follows the exact structure of `functions/[slug]/haji.ts` but adapted for the umroh template.

- [ ] **Step 1: Write the new `umroh.ts`**

Replace the entire contents of `functions/[slug]/umroh.ts` with:

```typescript
/**
 * Cloudflare Pages Function — Umroh Landing Page
 * Served at /:slug/umroh
 * Reads the original HTML from /public/umroh.html and replaces
 * WhatsApp links with agent-specific links, injects sticky agent bar.
 */

export const AGENTS: Record<string, { name: string; phone: string; website: string; photo: string }> = {
  // Copy the exact same AGENTS object from haji.ts (23 agents)
  'bagas': { name: 'Bagas Pramudita', phone: '6287878573311', website: 'alhijaz.co', photo: '/agents/bagas.jpg' },
  'nikita': { name: 'Nikita', phone: '62822900020', website: 'alhijazindonesia.com', photo: '/agents/nikita.jpg' },
  // ... all 23 agents identical to haji.ts
};
const DEFAULT_PHONE = '62822900020';

// WA_PATH, WA_SVG constants — identical to haji.ts
// buildStickyBarAndFab() function — identical to haji.ts, except:
//   - Hero selector: '.elementor-element-64c34f3d' (umroh hero) instead of '.elementor-element-f55e3ca' (haji hero)

// AgentOverride interface — identical to haji.ts

async function generateHTML(slug: string, agentOverride?: AgentOverride): Promise<string> {
  // Agent data resolution — identical pattern to haji.ts
  const agent = AGENTS[slug];
  const phone = agentOverride?.phone || agent?.phone || DEFAULT_PHONE;
  const agentName = agentOverride?.name || agent?.name || slug.charAt(0).toUpperCase() + slug.slice(1);
  const agentPhoto = agentOverride?.photo
    || 'https://xicthdsuvmwwuvwvvbqa.supabase.co/storage/v1/object/public/agent-photos/' + slug + '.jpg';
  const waBase = 'https://api.whatsapp.com/send?phone=' + phone;

  // Read template — identical pattern to haji.ts but reads umroh.html
  let html: string;
  try {
    const { readFileSync } = await import('fs');
    const { dirname, resolve } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dir = dirname(fileURLToPath(import.meta.url));
    html = readFileSync(resolve(__dir, '../../public/umroh.html'), 'utf-8');
  } catch {
    const res = await fetch('https://alhijaz.co/umroh.html');
    if (!res.ok) throw new Error('Failed to fetch umroh.html template: ' + res.status);
    html = await res.text();
  }

  // ═══════════════════════════════════════════════════
  // 1. REPLACE WHATSAPP LINKS
  // ═══════════════════════════════════════════════════
  // Generic approach: replace domain, inject phone, keep message text
  // All links follow: https://wa.alhijazindonesia.com/?message={text}
  // or:               https://wa.alhijazindonesia.com (bare, no message)
  // Replace with:     https://api.whatsapp.com/send?phone={phone}&text={text}
  html = html.replace(
    /https:\/\/wa\.alhijazindonesia\.com\/\?message=([^"]*)/g,
    waBase + '&text=$1'
  );
  // Bare link (no message param)
  html = html.replace(
    /https:\/\/wa\.alhijazindonesia\.com(?=["'])/g,
    waBase + '&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20Paket%20Umroh%20di%20Alhijaz'
  );

  // ═══════════════════════════════════════════════════
  // 2. UPDATE TITLE & OG TAGS
  // ═══════════════════════════════════════════════════
  const pageTitle = 'Umroh | ' + agentName + ' | PT Alhijaz Indowisata';
  html = html.replace(
    /<title>Paket Umroh \| Travel Umroh Terbaik \| PT Alhijaz Indowisata<\/title>/,
    '<title>' + pageTitle + '<' + '/title>'
  );
  html = html.replace(
    /(<meta property="og:title" content=")Paket Umroh \| Travel Umroh Terbaik \| PT Alhijaz Indowisata(")/,
    '$1' + pageTitle + '$2'
  );
  html = html.replace(
    /(<meta property="og:image" content=")[^"]*(")/,
    '$1https://alhijaz.co/og/' + slug + '.png$2'
  );

  // ═══════════════════════════════════════════════════
  // 3. REMOVE UNNECESSARY CSS
  // ═══════════════════════════════════════════════════
  // Font Awesome: replace 3 CORS-blocked stylesheets with 1 CDN
  html = html.replace(/<link[^>]*elementor-icons-shared-0-css[^>]*\/>/g, '');
  html = html.replace(/<link[^>]*elementor-icons-fa-brands-css[^>]*\/>/g, '');
  html = html.replace(/<link[^>]*elementor-icons-fa-solid-css[^>]*\/>/g, '');
  // Elementor Icons (eicons) — not used
  html = html.replace(/<link[^>]*elementor-icons-css[^>]*\/>/g, '');
  // Google Fonts bloated → inject optimized below
  html = html.replace(/<link[^>]*google-fonts-1-css[^>]*\/>/g, '');
  // Keep: elementor frontend, swiper, elementor-pro, landingpress, e-gallery

  // Inject optimized fonts + FA CDN + custom CSS before </head>
  html = html.replace(
    '</head>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" integrity="sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />\n'
    + '<st' + 'yle>'
    // Uniform button styling (page class: elementor-1291)
    + '.elementor-1291 .elementor-button{background-color:#28B83C!important;border-color:#149626!important;color:#fff!important;border-radius:50px!important;border-style:solid!important;border-width:3px!important;font-family:"Inter",sans-serif!important;font-weight:600!important;transition:background-color .2s,transform .2s!important}'
    + '.elementor-1291 .elementor-button:hover,.elementor-1291 .elementor-button:focus{background-color:#1DA855!important;transform:translateY(-1px)!important}'
    + '.elementor-1291 .elementor-button:active{transform:scale(.97)!important}'
    // Mobile overrides
    + '@media(max-width:767px){'
    // Hero "Umroh Pasti Berangkat" (60px → 32px)
    + '.elementor-element-25901017 .elementor-heading-title{font-size:32px!important;line-height:40px!important}'
    // Section headings 46-50px → 24px
    + '.elementor-element-83b623f .elementor-heading-title,'
    + '.elementor-element-7ef60bcc .elementor-heading-title,'
    + '.elementor-element-61fac271 .elementor-heading-title,'
    + '.elementor-element-14a03f8b .elementor-heading-title,'
    + '.elementor-element-1d41e06a .elementor-heading-title'
    + '{font-size:24px!important;line-height:32px!important}'
    // Icon box icons 41px → 28px
    + '.elementor-element-6d00c198 .elementor-icon,'
    + '.elementor-element-5c4b7ac7 .elementor-icon,'
    + '.elementor-element-553ebb7e .elementor-icon,'
    + '.elementor-element-4baee391 .elementor-icon,'
    + '.elementor-element-18727aa0 .elementor-icon'
    + '{font-size:28px!important}'
    + '}'
    + '</st' + 'yle>\n'
    + '<' + '/head>'
  );

  // ═══════════════════════════════════════════════════
  // 4. REMOVE SECTIONS
  // ═══════════════════════════════════════════════════
  // "Konsultasi via WA (Fast Response)" sticky bar
  html = html.replace(/<div class="heading-wa">[\s\S]*?<\/div>\s*<\/div>/g, '');
  // Footer section: Nikita profile, legalitas, rekening (element 26b2a887)
  html = html.replace(/<section[^>]*elementor-element-26b2a887[\s\S]*?<\/section>\s*(?=\s*<section|\s*<\/div>\s*<\/main>)/, '');

  // ═══════════════════════════════════════════════════
  // 5. REMOVE TRACKING & UNNECESSARY SCRIPTS
  // ═══════════════════════════════════════════════════
  html = html.replace(/<!-- Google tag \(gtag\.js\) -->/g, '');
  html = html.replace(/<script[^>]*googletagmanager\.com\/gtag[^>]*><\/script>/g, '');
  html = html.replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/g, '');
  html = html.replace(/<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/g, '');
  html = html.replace(/<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/g, '');
  html = html.replace(/<meta name="facebook-domain-verification"[^>]*>/g, '');
  html = html.replace(/<!-- Facebook Pixel Code -->[\s\S]*?<!-- End Facebook Pixel Code -->/g, '');
  html = html.replace(/<script>\(function\(\)\{function c\(\)[\s\S]*?<\/script>/g, '');
  html = html.replace(/<script type="application\/ld\+json" class="yoast-schema-graph">[\s\S]*?<\/script>/g, '');
  html = html.replace(/<script[^>]*flying-press-vitals-js-extra[\s\S]*?<\/script>/g, '');
  html = html.replace(/<script[^>]*flying-press[^>]*><\/script>/g, '');
  html = html.replace(/<script[^>]*landingpress-js[^>]*><\/script>/g, '');
  html = html.replace(/<script>\s*\(function\(\)\{\s*function getCookie[\s\S]*?<\/script>/g, '');
  html = html.replace(/<link rel="canonical"[^>]*\/>/g, '');
  html = html.replace(/<link rel='shortlink'[^>]*\/>/g, '');
  html = html.replace(/<meta name='robots'[^>]*\/>/g, '');

  // ═══════════════════════════════════════════════════
  // 6. PERFORMANCE
  // ═══════════════════════════════════════════════════
  html = html.replace(/(<img(?![^>]*loading=)[^>]*)(\/?>)/g, '$1 loading="lazy" $2');

  // ═══════════════════════════════════════════════════
  // 7. INJECT STICKY BAR + FAB
  // ═══════════════════════════════════════════════════
  const stickyBarHtml = buildStickyBarAndFab(agentName, agentPhoto, waBase + '&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20Paket%20Umroh%20di%20Alhijaz');
  html = html.replace('</body>', stickyBarHtml + '\n</body>');
  html = html.replace(/<body /, '<body style="padding-bottom:76px" ');

  return html;
}

export const onRequest = async (context: { params: { slug: string }; request: Request }) => {
  const slug = (context.params.slug || '').toLowerCase();
  const agentOverride = (context as any).agentOverride as AgentOverride | undefined;
  return new Response(await generateHTML(slug, agentOverride), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
```

Key differences from haji.ts:
- Template file: `umroh.html` instead of `haji-plus.html`
- WA replacement: generic regex `wa.alhijazindonesia.com/?message=(.*)` captures all 7 message variants
- Title: `Umroh | {name} | PT Alhijaz Indowisata`
- Page class: `elementor-1291` instead of `elementor-2333`
- Hero selector in sticky bar JS: `.elementor-element-64c34f3d` instead of `.elementor-element-f55e3ca`
- Footer section: `26b2a887` instead of `14608478`
- Mobile override element IDs: umroh-specific (25901017, 83b623f, etc.)
- Keep lottie.min.js and e-gallery (used on umroh page, not on haji)
- FA CSS: only 3 files to remove (no fa-regular on umroh page)
- No fa-regular-css removal needed (umroh doesn't load it)

All string building must avoid backtick template literals with `</script>` or `</style>` — use the same `'<st' + 'yle>'` and `'<sc' + 'ript>'` escaping as haji.ts.

- [ ] **Step 2: Verify dev server works**

Run: Start vite dev server, visit `http://localhost:5173/nikita/umroh`

Expected:
- Page renders identically to https://alhijazindonesia.com/umroh/
- Title: "Umroh | Nikita | PT Alhijaz Indowisata"
- WA links contain `phone=62822900020`
- No CORS font errors in console
- Sticky agent bar appears on scroll

- [ ] **Step 3: Rebuild .mjs**

Run:
```bash
npx esbuild "functions/[slug]/umroh.ts" --outfile=functions/umroh-landing.mjs --format=esm --platform=node
```

Expected: `functions/umroh-landing.mjs  ~19kb` with `AGENTS` and `onRequest` exports.

---

### Task 2: Update server.js — Cache + Supabase Agent Override

**Files:**
- Modify: `server.js:6596-6616` (umroh landing route)

- [ ] **Step 1: Replace the umroh route with cached version**

Replace lines 6596-6616 in `server.js`:

```javascript
// ──────────────────────────────────────────────
// Landing Page: /:slug/umroh (with in-memory cache)
// ──────────────────────────────────────────────
const umrohLandingCache = new Map(); // slug → { html, ts }
const UMROH_CACHE_TTL = 3600_000;    // 1 hour

async function generateUmrohPage(slug) {
  const mod = await import('./functions/umroh-landing.mjs');
  const agent = await getAgent(slug);
  const result = await mod.onRequest({
    params: { slug },
    request: new Request('http://localhost/' + slug + '/umroh'),
    agentOverride: agent ? { name: agent.name, phone: agent.phone, photo: agent.photo } : undefined,
  });
  return await result.text();
}

// Pre-load cache for ALL agents from Supabase on startup
(async () => {
  try {
    await new Promise(r => setTimeout(r, 2000));
    const agents = await getAgents();
    const slugs = Object.keys(agents);
    console.log('[Umroh Landing] Pre-caching ' + slugs.length + ' agents...');
    for (const slug of slugs) {
      try {
        const html = await generateUmrohPage(slug);
        umrohLandingCache.set(slug, { html, ts: Date.now() });
      } catch (e) {
        console.error('[Umroh Landing] Pre-cache failed for', slug, e.message);
      }
    }
    console.log('[Umroh Landing] Pre-cached ' + umrohLandingCache.size + ' pages');
  } catch (e) {
    console.error('[Umroh Landing] Pre-cache init failed:', e.message);
  }
})();

app.get('/:slug/umroh', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  try {
    const cached = umrohLandingCache.get(slug);
    if (cached && (Date.now() - cached.ts) < UMROH_CACHE_TTL) {
      return res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'HIT',
      }).send(cached.html);
    }

    const html = await generateUmrohPage(slug);
    umrohLandingCache.set(slug, { html, ts: Date.now() });

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Cache': 'MISS',
    }).send(html);
  } catch (err) {
    console.error('Umroh landing error:', err);
    res.status(500).send('Internal Server Error');
  }
});
```

- [ ] **Step 2: Verify production-ready**

Run:
```bash
npx esbuild "functions/[slug]/umroh.ts" --outfile=functions/umroh-landing.mjs --format=esm --platform=node
```

Check exports:
```bash
tail -5 functions/umroh-landing.mjs
```

Expected: `export { AGENTS, onRequest };`

---

### Task 3: End-to-End Verification

- [ ] **Step 1: Dev server test**

```bash
npm run dev
# Visit http://localhost:5173/nikita/umroh
# Visit http://localhost:5173/bagas/umroh
# Visit http://localhost:5173/yeyen/umroh (unknown agent)
```

Verify for each:
- Page renders with correct layout (identical to alhijazindonesia.com/umroh/)
- Title contains agent name
- WA links contain agent phone
- Sticky bar shows agent photo + name on scroll
- No CORS errors in console
- Slider/carousel works
- Mobile: font sizes reduced, no giant text

- [ ] **Step 2: Check cleanup**

```bash
# Should be 0:
curl -s http://localhost:5173/nikita/umroh | grep -c 'googletagmanager\|fbevents\|fbq\|flying-press\|yoast-schema'
# Should be 1 (cdnjs):
curl -s http://localhost:5173/nikita/umroh | grep -c 'cdnjs.cloudflare.com/ajax/libs/font-awesome'
# Should be 0 (old FA removed):
curl -s http://localhost:5173/nikita/umroh | grep -c 'elementor-icons-fa-solid-css'
# Footer removed:
curl -s http://localhost:5173/nikita/umroh | grep -c 'Legalitas Perusahaan'
# Heading-wa removed:
curl -s http://localhost:5173/nikita/umroh | grep -c 'Fast Response'
```

- [ ] **Step 3: Commit**

```bash
git add functions/[slug]/umroh.ts functions/umroh-landing.mjs server.js
git commit -m "refactor: rewrite umroh landing to template-based with cache + Supabase agent support"
```
