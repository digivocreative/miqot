// ═══════════════════════════════════════════════════════════════
// Server-side renderer for the kurs-share template
// ─────────────────────────────────────────────────────────────────
// Generates a per-agent kurs image (PNG/JPEG) by spinning up a
// headless Playwright Chromium page, loading an inline HTML version
// of the React `KursTemplate`, and screenshotting the rendered DOM.
//
// IMPORTANT — DUAL TEMPLATE:
//   This file mirrors the structure of `src/components/KursShareTemplates.tsx`
//   (the in-app preview/modal template). When the design of one
//   changes, update the other to match. Cross-reference comments
//   in both files point at this file.
// ═══════════════════════════════════════════════════════════════

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_W = 1400;
const TEMPLATE_H = 1000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

let browserPromise = null;

// ─── Inlined asset cache ─────────────────────────────────────────
// Read once on first use, keep base64 in memory. Eliminates every
// external network request from the Playwright render — previously
// Google Fonts / ui-avatars / the local logo URL could stall
// `waitUntil:'networkidle'` and trip the 20s timeout.

let _fontCss = null;
let _logoDataUri = null;

function getInlineFontCss() {
  if (_fontCss != null) return _fontCss;
  const dir = path.join(PUBLIC_DIR, 'fonts', 'brochure');
  const weights = [
    { weight: 600, file: 'Inter-SemiBold.woff2' },
    { weight: 700, file: 'Inter-Bold.woff2' },
    { weight: 800, file: 'Inter-ExtraBold.woff2' },
    { weight: 900, file: 'Inter-Black.woff2' },
  ];
  const faces = weights
    .map(({ weight, file }) => {
      const p = path.join(dir, file);
      if (!fs.existsSync(p)) return '';
      const b64 = fs.readFileSync(p).toString('base64');
      return `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    })
    .filter(Boolean)
    .join('\n');
  _fontCss = faces;
  return _fontCss;
}

function getInlineLogoDataUri() {
  if (_logoDataUri != null) return _logoDataUri;
  const p = path.join(PUBLIC_DIR, 'logo-alhijaz-besar.svg');
  const b64 = fs.readFileSync(p).toString('base64');
  _logoDataUri = `data:image/svg+xml;base64,${b64}`;
  return _logoDataUri;
}

async function fetchPhotoAsDataUri(url, timeoutMs = 4000) {
  if (!url) return null;
  if (typeof url === 'string' && url.startsWith('data:')) return url;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (browser.isConnected()) return browser;
    } catch {}
    browserPromise = null;
  }
  browserPromise = chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return browserPromise;
}

export async function closeKursBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {}
  browserPromise = null;
}

// ─── Helpers (mirror of KursShareTemplates.tsx helpers) ──────────

function formatKurs(rate) {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rate);
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}

function avatarFallback(name) {
  const safe = String(name || 'A').trim();
  const initials =
    safe
      .split(/\s+/)
      .map(s => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'A';
  let hash = 0;
  for (let i = 0; i < safe.length; i++) hash = (hash * 31 + safe.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const bg = `hsl(${hue},55%,42%)`;
  const text = initials
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">` +
    `<rect width="192" height="192" fill="${bg}"/>` +
    `<text x="50%" y="50%" font-family="Inter,Arial,sans-serif" font-size="86" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function cleanWebsite(website) {
  return String(website || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '');
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Inline SVGs (mirror of KursShareTemplates.tsx components) ───

function flagUsSvg(size = 62) {
  const w = Math.round(size * 1.4);
  const stripes = [0, 2, 4, 6, 8, 10, 12]
    .map(y => `<rect x="0" y="${y * 1.5}" width="30" height="1.62" fill="#B22234" />`)
    .join('');
  return `<svg width="${w}" height="${size}" viewBox="0 0 30 21" style="border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,0.3);flex-shrink:0">
    <rect width="30" height="21" fill="#fff" />
    ${stripes}
    <rect width="12" height="11.32" fill="#3C3B6E" />
  </svg>`;
}

function calendarIconSvg(size = 34) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="#F8DFA1" stroke-width="1.8" />
    <path d="M7.5 3.5V7.2M16.5 3.5V7.2M4 9.2H20" stroke="#F8DFA1" stroke-width="1.8" stroke-linecap="round" />
    <path d="M8 13H10M12 13H14M16 13H18M8 16H10M12 16H14" stroke="#D1FAE5" stroke-width="1.6" stroke-linecap="round" />
  </svg>`;
}

function verifiedCheckSvg(size = 34) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" style="flex-shrink:0">
    <circle cx="20" cy="20" r="17" fill="#1D9BF0" stroke="#FFFFFF" stroke-width="5" />
    <path d="M12.8 20.7L17.4 25.3L27.9 14.8" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

function geometricPatternSvg() {
  return `<svg width="${TEMPLATE_W}" height="${TEMPLATE_H}" viewBox="0 0 ${TEMPLATE_W} ${TEMPLATE_H}" style="position:absolute;inset:0;opacity:1;z-index:0">
    <g opacity="0.06" stroke="#D1FAE5" stroke-width="1.1">
      <path d="M80 190H1320M80 350H1320M80 510H1320M80 670H1320" />
      <path d="M180 110L20 270M360 110L200 270M540 110L380 270M720 110L560 270M900 110L740 270M1080 110L920 270M1260 110L1100 270M1440 110L1280 270" />
    </g>

    <g transform="translate(1015 482)" opacity="0.19" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M0 -260C62 -192 62 -88 0 -18C-62 -88 -62 -192 0 -260Z" stroke="#F8DFA1" stroke-width="4" />
      <path d="M0 260C62 192 62 88 0 18C-62 88 -62 192 0 260Z" stroke="#F8DFA1" stroke-width="4" />
      <path d="M-260 0C-192 -62 -88 -62 -18 0C-88 62 -192 62 -260 0Z" stroke="#F8DFA1" stroke-width="4" />
      <path d="M260 0C192 -62 88 -62 18 0C88 62 192 62 260 0Z" stroke="#F8DFA1" stroke-width="4" />

      <path d="M-184 -184C-92 -180 -28 -108 -18 -18C-108 -28 -180 -92 -184 -184Z" stroke="#D1FAE5" stroke-width="3" />
      <path d="M184 -184C180 -92 108 -28 18 -18C28 -108 92 -180 184 -184Z" stroke="#D1FAE5" stroke-width="3" />
      <path d="M184 184C92 180 28 108 18 18C108 28 180 92 184 184Z" stroke="#D1FAE5" stroke-width="3" />
      <path d="M-184 184C-180 92 -108 28 -18 18C-28 108 -92 180 -184 184Z" stroke="#D1FAE5" stroke-width="3" />

      <path d="M0 -18C38 -62 38 -122 0 -166C-38 -122 -38 -62 0 -18Z" stroke="#D1FAE5" stroke-width="2.2" opacity="0.85" />
      <path d="M0 18C38 62 38 122 0 166C-38 122 -38 62 0 18Z" stroke="#D1FAE5" stroke-width="2.2" opacity="0.85" />
      <path d="M-18 0C-62 -38 -122 -38 -166 0C-122 38 -62 38 -18 0Z" stroke="#D1FAE5" stroke-width="2.2" opacity="0.85" />
      <path d="M18 0C62 -38 122 -38 166 0C122 38 62 38 18 0Z" stroke="#D1FAE5" stroke-width="2.2" opacity="0.85" />

      <path d="M-130 -42C-76 -86 -30 -84 0 0C30 -84 76 -86 130 -42" stroke="#F8DFA1" stroke-width="2.4" opacity="0.85" />
      <path d="M-130 42C-76 86 -30 84 0 0C30 84 76 86 130 42" stroke="#F8DFA1" stroke-width="2.4" opacity="0.85" />
      <path d="M-42 -130C-86 -76 -84 -30 0 0C-84 30 -86 76 -42 130" stroke="#F8DFA1" stroke-width="2.4" opacity="0.85" />
      <path d="M42 -130C86 -76 84 -30 0 0C84 30 86 76 42 130" stroke="#F8DFA1" stroke-width="2.4" opacity="0.85" />

      <circle cx="0" cy="0" r="34" stroke="#F8DFA1" stroke-width="3" />
      <circle cx="0" cy="0" r="12" stroke="#D1FAE5" stroke-width="2" />
    </g>

    <g transform="translate(1220 265) scale(0.58)" opacity="0.12" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M0 -180C44 -132 44 -60 0 -12C-44 -60 -44 -132 0 -180Z" stroke="#F8DFA1" stroke-width="4" />
      <path d="M0 180C44 132 44 60 0 12C-44 60 -44 132 0 180Z" stroke="#F8DFA1" stroke-width="4" />
      <path d="M-180 0C-132 -44 -60 -44 -12 0C-60 44 -132 44 -180 0Z" stroke="#F8DFA1" stroke-width="4" />
      <path d="M180 0C132 -44 60 -44 12 0C60 44 132 44 180 0Z" stroke="#F8DFA1" stroke-width="4" />
      <path d="M-120 -120C-54 -116 -16 -64 -10 -10C-64 -16 -116 -54 -120 -120Z" stroke="#D1FAE5" stroke-width="3" />
      <path d="M120 120C54 116 16 64 10 10C64 16 116 54 120 120Z" stroke="#D1FAE5" stroke-width="3" />
    </g>
  </svg>`;
}

// ─── Main HTML builder ───────────────────────────────────────────

function buildKursHtml({ kurs, agent, photoDataUri }) {
  const photo = photoDataUri || avatarFallback(agent.name);
  const wa = normalizePhone(agent.phone);
  const website = agent.website && agent.website.trim()
    ? cleanWebsite(agent.website)
    : `wa.me/${wa}`;
  const logoSrc = getInlineLogoDataUri();

  // Inline-style strings (mirror JSX inline styles 1:1)
  const fontStack = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<style>
  ${getInlineFontCss()}
  *,*::before,*::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body { font-family: ${fontStack}; }
  img { display: block; }
</style>
</head><body>
<div id="kurs-export" style="
  width:${TEMPLATE_W}px;
  height:${TEMPLATE_H}px;
  background:radial-gradient(circle at 76% 34%, rgba(248,223,161,0.14) 0%, rgba(248,223,161,0) 28%), radial-gradient(circle at 20% 72%, rgba(110,231,183,0.16) 0%, rgba(110,231,183,0) 26%), linear-gradient(135deg,#054233 0%,#0F6E56 52%,#064e3b 100%);
  position:relative;
  overflow:hidden;
  font-family:${fontStack};
  padding:68px 84px 62px;
  display:flex;
  flex-direction:column;
">
  ${geometricPatternSvg()}

  <!-- Top row: Title + Logo -->
  <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:2;">
    <div style="min-width:0;">
      <h1 style="font-size:78px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:1;margin:0;white-space:nowrap;">
        Kurs Hari Ini
      </h1>
      <div style="margin-top:18px;font-size:28px;color:#D1FAE5;font-weight:600;letter-spacing:0;white-space:nowrap;">
        Update nilai tukar USD ke Rupiah
      </div>
    </div>
    <div style="width:300px;display:flex;justify-content:flex-end;flex-shrink:0;">
      <img src="${escHtml(logoSrc)}" alt="Alhijaz"
           style="height:150px;width:auto;filter:brightness(0) invert(1);opacity:0.96;" />
    </div>
  </div>

  <!-- USD hero -->
  <div style="margin-top:74px;position:relative;z-index:2;">
    <div style="display:inline-flex;align-items:center;gap:20px;margin-bottom:30px;padding:16px 24px 16px 18px;border-radius:999px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);box-shadow:0 20px 60px rgba(0,0,0,0.14);backdrop-filter:blur(10px);">
      ${flagUsSvg(62)}
      <span style="font-size:40px;font-weight:800;color:#fff;letter-spacing:2px;">USD</span>
      <span style="width:1px;height:42px;background:rgba(255,255,255,0.25);"></span>
      <span style="font-size:28px;font-weight:600;color:#D1FAE5;">US Dollar</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:22px;white-space:nowrap;">
      <span style="font-size:72px;font-weight:800;color:#F8DFA1;line-height:1;">Rp</span>
      <span style="font-size:246px;font-weight:900;color:#fff;line-height:0.9;letter-spacing:-5px;font-family:${fontStack};">
        ${formatKurs(kurs.usd)}
      </span>
    </div>
    <div style="display:flex;align-items:center;gap:16px;margin-top:26px;font-size:34px;color:#D1FAE5;font-weight:600;">
      <span style="width:58px;height:4px;border-radius:999px;background:#F8DFA1;"></span>
      <span>per 1 USD</span>
    </div>
  </div>

  <div style="flex:1;"></div>

  <!-- Bottom row: Agent + Date -->
  <div style="display:flex;justify-content:space-between;align-items:center;padding:26px 30px;border-radius:34px;background:rgba(3,59,45,0.58);border:1px solid rgba(248,223,161,0.22);box-shadow:0 24px 80px rgba(0,0,0,0.18);backdrop-filter:blur(12px);position:relative;z-index:2;">
    <div style="display:flex;align-items:center;gap:20px;">
      <img src="${escHtml(photo)}" alt=""
           style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:4px solid #F8DFA1;flex-shrink:0;box-shadow:0 10px 28px rgba(0,0,0,0.22);" />
      <div style="display:flex;flex-direction:column;line-height:1.2;min-width:0;">
        <strong style="display:flex;align-items:center;gap:12px;font-size:36px;color:#fff;font-weight:800;max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(agent.name)}</span>
          ${verifiedCheckSvg(34)}
        </strong>
        <span style="font-size:24px;color:#A7F3D0;font-weight:600;margin-top:6px;">
          ${escHtml(website)}
        </span>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);font-size:28px;color:#fff;font-weight:700;white-space:nowrap;">
      ${calendarIconSvg(34)}
      <span>${escHtml(kurs.updatedAt)}</span>
    </div>
  </div>
</div>
</body></html>`;
}

// ─── Render entry point ──────────────────────────────────────────

/**
 * Generate a kurs share image for one agent.
 *
 * @param {{
 *   kurs:  { usd: number, updatedAt: string },
 *   agent: { name: string, phone: string, photo?: string, slug: string, website?: string },
 *   format?: 'jpeg' | 'png',
 *   quality?: number,
 * }} input
 * @returns {Promise<Buffer>}
 */
export async function generateKursImageBuffer({ kurs, agent, format = 'jpeg', quality = 88 }) {
  // Pre-fetch the agent photo from Node so the Playwright render is
  // 100% offline. A slow/missing photo falls back to an inline SVG
  // avatar; either way the page has zero outbound network needs.
  const photoDataUri = (await fetchPhotoAsDataUri(agent.photo)) || avatarFallback(agent.name);
  const html = buildKursHtml({ kurs, agent, photoDataUri });

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: TEMPLATE_W, height: TEMPLATE_H },
    deviceScaleFactor: 1,
  });

  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });

    // Belt-and-braces: explicitly load every weight the template uses,
    // then await fonts.ready. Mirrors the client-side waitForFonts logic.
    await page.evaluate(async () => {
      if (!document.fonts) return;
      const weights = [600, 700, 800, 900];
      await Promise.all(
        weights.map(w => document.fonts.load(`${w} 16px Inter`).catch(() => null))
      );
      await document.fonts.ready;
    });

    const element = await page.$('#kurs-export');
    if (!element) throw new Error('Kurs export element not found');

    const buffer = await element.screenshot({
      type: format,
      quality: format === 'jpeg' ? quality : undefined,
      omitBackground: false,
    });
    return buffer;
  } finally {
    await context.close().catch(() => {});
  }
}
