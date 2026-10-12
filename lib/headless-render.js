// Bagian bersama render server di headless Chromium (kartu nama, banner cuaca).
// Satu antrean untuk semua: VPS kecil, satu Chromium pada satu waktu.
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BROCHURE_FONT_DIR = resolve(ROOT, 'public/fonts/brochure');

const fontCssCache = new Map();

// Font di-embed sebagai data: agar halaman setContent mandiri (tanpa dependensi
// express static / port) dan font PASTI termuat sebelum screenshot.
export function getEmbeddedFontCss(faces, fontDir = BROCHURE_FONT_DIR) {
  const key = `${fontDir}|${faces.map(f => f.join(':')).join(',')}`;
  if (fontCssCache.has(key)) return fontCssCache.get(key);
  const css = faces.map(([family, weight, file]) => {
    const b64 = readFileSync(resolve(fontDir, file)).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
  fontCssCache.set(key, css);
  return css;
}

// Host foto agent yang boleh dirender (storage sendiri + ui-avatars), dipakai
// kartu nama dan banner cuaca.
const AGENT_PHOTO_HOSTS = new Set(['sb.alhijaz.co', 'alhijaz.co', 'www.alhijaz.co', 'ui-avatars.com']);

export function isAllowedAgentPhotoUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && AGENT_PHOTO_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

let renderLock = Promise.resolve();

export function withRenderLock(run) {
  const p = renderLock.then(run, run);
  renderLock = p.then(() => {}, () => {});
  return p;
}
