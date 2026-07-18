// Export kartu nama server-side: render designs.tsx di headless Chromium (Playwright)
// lalu element-screenshot → PNG. Menjamin hasil export identik dengan preview di semua
// device — snapdom di klien tetap ada sebagai fallback, tapi WebKit/Safari me-raster
// foreignObject dengan font fallback (teks turun baris), jadi jalur utama pindah ke sini.
//
// Resolusi terkunci: deviceScaleFactor 2 → landscape 2100×1200, portrait 1200×2040.
import { buildSync } from 'esbuild';
import { readFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENTRY = resolve(ROOT, 'src/card-export-entry.tsx');
const DESIGNS = resolve(ROOT, 'src/components/business-card/designs.tsx');
const FONT_DIR = resolve(ROOT, 'public/fonts/brochure');

const DESIGN_IDS = new Set(['d1', 'd2', 'd3', 'd4', 'd5']);
// Ukuran harus sinkron dengan CARD_SIZE di designs.tsx (TS tidak bisa diimpor dari sini).
const CARD_SIZE = { landscape: { w: 1050, h: 600 }, portrait: { w: 600, h: 1020 } };
// Host foto yang boleh dirender (foto agent dilayani storage sendiri).
const PHOTO_HOSTS = new Set(['sb.alhijaz.co', 'alhijaz.co', 'www.alhijaz.co', 'ui-avatars.com']);
const STR_LIMITS = { name: 90, initials: 6, role: 60, brand: 60, wa: 40, email: 120, web: 120, qrCaption: 60 };

// Font yang dipakai desain kartu — sinkron dengan @font-face di index.html.
const FONT_FACES = [
  ['Inter', 400, 'Inter-Regular.woff2'],
  ['Inter', 600, 'Inter-SemiBold.woff2'],
  ['Inter', 700, 'Inter-Bold.woff2'],
  ['Inter', 800, 'Inter-ExtraBold.woff2'],
  ['Inter', 900, 'Inter-Black.woff2'],
  ['Playfair Display', 800, 'PlayfairDisplay.woff2'],
  ['Montserrat', 700, 'Montserrat-Bold.woff2'],
  ['Montserrat', 800, 'Montserrat-ExtraBold.woff2'],
  ['Montserrat', 900, 'Montserrat-Black.woff2'],
];

let bundleCache = null;   // { key, code }
let fontCssCache = null;  // string

function getBundle() {
  const key = `${statSync(ENTRY).mtimeMs}:${statSync(DESIGNS).mtimeMs}`;
  if (bundleCache?.key === key) return bundleCache.code;
  const out = buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    loader: { '.webp': 'dataurl', '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' },
    absWorkingDir: ROOT,
    logLevel: 'silent',
  });
  bundleCache = { key, code: out.outputFiles[0].text };
  return bundleCache.code;
}

// Font di-embed sebagai data: agar halaman setContent mandiri (tanpa dependensi
// express static / port) dan font PASTI termuat sebelum screenshot.
function getFontCss() {
  if (fontCssCache) return fontCssCache;
  fontCssCache = FONT_FACES.map(([family, weight, file]) => {
    const b64 = readFileSync(resolve(FONT_DIR, file)).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
  return fontCssCache;
}

function shellHtml(payload) {
  // < meng-escape "<" agar string payload tak bisa menutup tag <script>.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#ffffff}
${getFontCss()}
</style></head><body><div id="card"></div><script>window.CARD_RENDER = ${json};</script><script>${getBundle()}</script></body></html>`;
}

export function validateCardExportBody(body) {
  const { design, format, props } = body || {};
  if (!DESIGN_IDS.has(design)) return { error: 'design tidak dikenal' };
  if (!CARD_SIZE[format]) return { error: 'format tidak dikenal' };
  if (!props || typeof props !== 'object') return { error: 'props wajib' };
  const clean = {};
  for (const [k, max] of Object.entries(STR_LIMITS)) {
    const v = props[k];
    if (v != null && typeof v !== 'string') return { error: `props.${k} harus string` };
    if ((v || '').length > max) return { error: `props.${k} terlalu panjang` };
    clean[k] = v || '';
  }
  if (!clean.name) return { error: 'props.name wajib' };
  const qr = props.qrDataUrl || '';
  if (qr && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr)) return { error: 'qrDataUrl tidak valid' };
  if (qr.length > 300000) return { error: 'qrDataUrl terlalu besar' };
  clean.qrDataUrl = qr;
  let photoUrl = props.photoUrl || null;
  if (photoUrl) {
    if (typeof photoUrl !== 'string' || photoUrl.length > 500) return { error: 'photoUrl tidak valid' };
    try {
      const u = new URL(photoUrl);
      if (u.protocol !== 'https:' || !PHOTO_HOSTS.has(u.hostname)) return { error: 'photoUrl host tidak diizinkan' };
    } catch { return { error: 'photoUrl tidak valid' }; }
  }
  clean.photoUrl = photoUrl;
  return { design, format, props: clean };
}

// Satu render pada satu waktu (VPS kecil); browser ditutup setiap selesai.
let renderLock = Promise.resolve();

export async function renderCardPng({ design, format, props }) {
  const run = async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const { w, h } = CARD_SIZE[format];
      const context = await browser.newContext({
        viewport: { width: w + 20, height: h + 20 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await page.setContent(shellHtml({ design, format, props }), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__ready === true || window.__renderError', null, { timeout: 25000 });
      const err = await page.evaluate('window.__renderError || null');
      if (err) throw new Error(`render page: ${err}`);
      const el = await page.$('#card');
      return await el.screenshot({ type: 'png' });
    } finally {
      await browser.close().catch(() => {});
    }
  };
  const p = renderLock.then(run, run);
  renderLock = p.then(() => {}, () => {});
  return p;
}

export async function handleCardExport(req, res) {
  const v = validateCardExportBody(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const t0 = Date.now();
    const png = await renderCardPng(v);
    console.log(`[card-export] ${v.design}/${v.format} ${png.length} bytes in ${Date.now() - t0}ms`);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (e) {
    console.error('[card-export] gagal:', e.message);
    res.status(500).json({ error: 'Export gagal di server' });
  }
}
