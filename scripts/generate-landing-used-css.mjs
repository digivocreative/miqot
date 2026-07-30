#!/usr/bin/env node
// Generator "used CSS" untuk landing page /:slug/umroh & /:slug/haji.
//
// Latar: 4-5 stylesheet framework (Elementor/Elementor Pro/LandingPress/Swiper/
// E-Gallery) bersifat render-blocking (~466KB raw, ~60KB br) dan menunda FCP/LCP
// ±400-600ms di mobile. Solusi: inline subset CSS yang benar-benar terpakai ke
// dalam HTML, lalu muat stylesheet aslinya secara async (media="print" swap,
// lihat deferBlockingStylesheets di functions/[slug]/fa-icons.ts). Stylesheet
// penuh tetap dimuat, jadi rule yang luput dari ekstraksi tersembuhkan sendiri
// begitu file penuh tiba (worst case: FOUC singkat di bawah fold, bukan rusak).
//
// Cara kerja:
// 1. Playwright CSS coverage atas halaman live pada 3 viewport (mobile 390,
//    tablet 810, desktop 1366) + scroll penuh (memicu waypoint/animasi/sticky).
// 2. Union range "used" per stylesheet, lalu ekstrak via postcss dengan
//    MEMPERTAHANKAN pembungkus @media/@supports (range coverage Chrome tidak
//    menyertakan prelude at-rule — slicing naif akan membuat rule mobile bocor
//    ke desktop).
// 3. @font-face & @keyframes selalu di-keep (deteksi coverage untuk keduanya
//    tidak andal). File kecil (swiper, e-gallery) di-include utuh — kelas
//    runtime swiper (active/duplicate/bullet) terlalu dinamis untuk coverage.
// 4. url(...) relatif diresolve jadi root-relative (/wp-content/...) supaya
//    rewriteAssetsToCdn tetap yang memutuskan host CDN saat runtime.
//
// Jalankan ulang bila template WP (public/umroh.html / haji-plus.html) atau
// versi CSS berubah:
//   node scripts/generate-landing-used-css.mjs [urlUmroh] [urlHaji]
// lalu `npm run build:functions` dan commit functions/[slug]/landing-critical.ts.
import { chromium } from 'playwright';
import postcss from 'postcss';
import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const UMROH_URL = process.argv[2] || 'https://alhijaz.co/bagas/umroh';
const HAJI_URL = process.argv[3] || 'https://alhijaz.co/bagas/haji';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../functions/[slug]/landing-critical.ts');

// File kecil + state runtime dinamis → include utuh, tanpa ekstraksi.
const FULL_INCLUDE = [/\/swiper\.min\.css/, /\/e-gallery\.min\.css/];
// Hanya stylesheet EKSTERNAL (link). Blok <style> inline WP bisa muncul di
// coverage dengan sourceURL path-relative (mis. classic-themes.min.css) — skip.
const TARGET_CSS = /^https?:\/\/.+\/(wp-content|wp-includes)\/.*\.css(\?|$)/;

const VIEWPORTS = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'tablet', viewport: { width: 810, height: 1080 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1366, height: 900 }, isMobile: false, hasTouch: false },
];

async function collectCoverage(browser, url) {
  // { cssUrl → { text, ranges: [{start,end}] } }
  const byUrl = new Map();
  let linkOrder = null;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(2500); // swiper/e-gallery init
    // Scroll bertahap sampai bawah: memicu waypoints (.animated), sticky bar, lazy sections
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.7;
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 500));
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    if (!linkOrder) {
      linkOrder = await page.evaluate(() =>
        [...document.querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="style"], noscript')]
          .flatMap(el => {
            if (el.tagName === 'NOSCRIPT') return []; // urutan dari link asli saja
            return el.href ? [el.href] : [];
          })
      );
    }
    const entries = await page.coverage.stopCSSCoverage();
    for (const e of entries) {
      if (!e.url || !TARGET_CSS.test(e.url)) continue;
      const cur = byUrl.get(e.url) || { text: e.text, ranges: [] };
      cur.ranges.push(...e.ranges);
      byUrl.set(e.url, cur);
    }
    await ctx.close();
    console.log(`  [${vp.name}] ok — ${byUrl.size} css files tracked`);
  }
  return { byUrl, linkOrder: linkOrder || [] };
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

function offsetOf(text, lineStarts, pos) {
  if (typeof pos?.offset === 'number') return pos.offset;
  return lineStarts[pos.line - 1] + pos.column - 1;
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

// Resolve url(...) relatif terhadap path stylesheet → root-relative.
function resolveCssUrls(root, cssUrl) {
  const basePath = new URL(cssUrl).pathname.replace(/\/[^/]*$/, '/');
  root.walkDecls(decl => {
    if (!decl.value.includes('url(')) return;
    decl.value = decl.value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
      if (/^(data:|https?:|\/\/|\/|#)/.test(ref)) return m;
      const abs = new URL(ref, 'https://x' + basePath).pathname;
      return `url(${q}${abs}${q})`;
    });
  });
}

function extractUsed(cssText, cssUrl, ranges) {
  const merged = mergeRanges(ranges);
  const lineStarts = buildLineStarts(cssText);
  const root = postcss.parse(cssText, { from: cssUrl });
  const overlaps = (s, e) => {
    for (const r of merged) {
      if (r.start >= e) break;
      if (r.end > s && r.start < e) return true;
    }
    return false;
  };
  root.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /^(-\w+-)?keyframes$/.test(rule.parent.name)) return; // keyframe steps ikut parent
    const s = offsetOf(cssText, lineStarts, rule.source.start);
    const e = offsetOf(cssText, lineStarts, rule.source.end) + 1;
    if (!overlaps(s, e)) rule.remove();
  });
  root.walkAtRules(at => {
    if (/^(-\w+-)?(keyframes|font-face|charset)$/.test(at.name)) return; // selalu keep
    if (/^(media|supports)$/.test(at.name) && (!at.nodes || at.nodes.length === 0)) at.remove();
  });
  root.walkComments(c => c.remove());
  resolveCssUrls(root, cssUrl);
  return root.toString();
}

function fullFile(cssText, cssUrl) {
  const root = postcss.parse(cssText, { from: cssUrl });
  root.walkComments(c => c.remove());
  resolveCssUrls(root, cssUrl);
  return root.toString();
}

function braceBalance(css) {
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

async function generateFor(browser, label, url) {
  console.log(`\n=== ${label}: ${url}`);
  const { byUrl, linkOrder } = await collectCoverage(browser, url);
  // Urutkan file sesuai urutan <link> di head (cascade harus sama persis)
  const orderedUrls = linkOrder.filter(u => byUrl.has(u));
  for (const u of byUrl.keys()) if (!orderedUrls.includes(u)) orderedUrls.push(u);
  const parts = [];
  let rawTotal = 0;
  for (const u of orderedUrls) {
    const { text, ranges } = byUrl.get(u);
    rawTotal += text.length;
    const short = u.replace(/\?.*$/, '').split('/').slice(-1)[0];
    const css = FULL_INCLUDE.some(re => re.test(u)) ? fullFile(text, u) : extractUsed(text, u, ranges);
    if (!braceBalance(css)) throw new Error(`Brace tidak seimbang pada ekstraksi ${short} — periksa generator`);
    console.log(`  ${short}: ${text.length} → ${css.length} bytes${FULL_INCLUDE.some(re => re.test(u)) ? ' (full include)' : ''}`);
    parts.push(css);
  }
  const combined = parts.join('\n');
  console.log(`  TOTAL: ${rawTotal} → ${combined.length} bytes (${(100 * combined.length / rawTotal).toFixed(1)}%)`);
  return combined;
}

const browser = await chromium.launch();
try {
  const umroh = await generateFor(browser, 'UMROH', UMROH_URL);
  const haji = await generateFor(browser, 'HAJI', HAJI_URL);
  const banner = [
    '// FILE INI DI-GENERATE — jangan edit manual.',
    '// Regenerasi: node scripts/generate-landing-used-css.mjs && npm run build:functions',
    `// Sumber: ${UMROH_URL} + ${HAJI_URL} (coverage mobile/tablet/desktop, ${new Date().toISOString().slice(0, 10)})`,
    '// Dipakai deferBlockingStylesheets() di fa-icons.ts: subset CSS ini di-inline,',
    '// stylesheet penuh tetap dimuat async sebagai jaring pengaman.',
    '',
  ].join('\n');
  const ts = banner
    + 'export const UMROH_USED_CSS: string = ' + JSON.stringify(umroh) + ';\n\n'
    + 'export const HAJI_USED_CSS: string = ' + JSON.stringify(haji) + ';\n';
  writeFileSync(OUT, ts);
  console.log(`\nDitulis: ${OUT} (${ts.length} bytes)`);
} finally {
  await browser.close();
}
