// Render banner Share Cuaca di server: bundle src/cuaca-share-entry.tsx (komponen
// yang sama dengan pratinjau) → headless Chromium → JPEG 1080×1350 (spec 2026-10-12).
import { buildSync } from 'esbuild';
import { readFileSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { CUACA_SHARE_H, CUACA_SHARE_W } from './cuaca-share-data.js';
import { getEmbeddedFontCss, withRenderLock } from './headless-render.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/cuaca-share-entry.tsx');
const BUNDLE_INPUTS = [
  ENTRY,
  resolve(ROOT, 'src/components/cuaca-share/CuacaShareTemplate.tsx'),
  resolve(ROOT, 'src/components/cuaca-share/CuacaOrnament.tsx'),
  resolve(ROOT, 'lib/cuaca-share-data.js'),
];
const PHOTO_DIR = resolve(ROOT, 'public/cuaca-share');
const LOGO_PATH = resolve(ROOT, 'public/logo-alhijaz-besar.svg');
const FONT_FACES = [
  ['Inter', 400, 'Inter-Regular.woff2'],
  ['Inter', 600, 'Inter-SemiBold.woff2'],
  ['Inter', 700, 'Inter-Bold.woff2'],
  ['Inter', 800, 'Inter-ExtraBold.woff2'],
];
// Sinkron dengan PHOTO_HOSTS di lib/card-export.js (foto agent: storage sendiri + ui-avatars).
const AGENT_PHOTO_HOSTS = new Set(['sb.alhijaz.co', 'alhijaz.co', 'www.alhijaz.co', 'ui-avatars.com']);
const AGENT_PHOTO_TYPES = /^image\/(jpeg|png|webp|gif|svg\+xml)$/;
const AGENT_PHOTO_MAX_BYTES = 3 * 1024 * 1024;

let bundleCache = null; // { key, code }
let logoDataUri = null;

function getBundle() {
  const key = BUNDLE_INPUTS.map(f => statSync(f).mtimeMs).join(':');
  if (bundleCache?.key === key) return bundleCache.code;
  const out = buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    absWorkingDir: ROOT,
    logLevel: 'silent',
  });
  bundleCache = { key, code: out.outputFiles[0].text };
  return bundleCache.code;
}

function getLogoDataUri() {
  logoDataUri ||= `data:image/svg+xml;base64,${readFileSync(LOGO_PATH).toString('base64')}`;
  return logoDataUri;
}

export function isAllowedAgentPhotoUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && AGENT_PHOTO_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// Foto agent gagal (host asing, lambat, bukan gambar, terlalu besar) → null →
// template memakai inisial. Render tidak pernah gagal karena foto.
export async function fetchAgentPhotoDataUri(url, { timeoutMs = 4000, fetchImpl = fetch } = {}) {
  if (!isAllowedAgentPhotoUrl(url)) return null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!AGENT_PHOTO_TYPES.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > AGENT_PHOTO_MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function loadCuacaShareAssets(data, agentPhotoUrl, opts = {}) {
  const photoSrc = data.photo
    ? `data:image/jpeg;base64,${readFileSync(resolve(PHOTO_DIR, data.photo)).toString('base64')}`
    : null;
  return {
    photoSrc,
    logoSrc: getLogoDataUri(),
    agentPhotoSrc: await fetchAgentPhotoDataUri(agentPhotoUrl, opts),
  };
}

export function buildCuacaShellHtml(payload, { bundle, fontCss } = {}) {
  // "<" di-escape agar string payload tak bisa menutup tag <script>.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:#054233}
${fontCss ?? getEmbeddedFontCss(FONT_FACES)}
</style></head><body><div id="banner"></div><script>window.CUACA_RENDER = ${json};</script><script>${bundle ?? getBundle()}</script></body></html>`;
}

export async function renderCuacaShareJpeg({ data, assets }) {
  return withRenderLock(async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: CUACA_SHARE_W, height: CUACA_SHARE_H },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.setContent(buildCuacaShellHtml({ data, assets }), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__ready === true || window.__renderError', null, { timeout: 25000 });
      const err = await page.evaluate('window.__renderError || null');
      if (err) throw new Error(`render page: ${err}`);
      const el = await page.$('[data-cuaca-share]');
      if (!el) throw new Error('elemen banner tidak ditemukan');
      return await el.screenshot({ type: 'jpeg', quality: 88 });
    } finally {
      await browser.close().catch(() => {});
    }
  });
}
