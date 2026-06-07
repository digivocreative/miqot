#!/usr/bin/env node
// Generate functions/[slug]/fa-icons.ts dari SVG Font Awesome Free 5.15.4 (cdnjs).
// Sekali jalan; hasil di-commit sehingga runtime tidak pernah fetch eksternal.
// Pakai: node scripts/generate-fa-icons.mjs
import { writeFileSync } from 'fs';

const ICONS = [
  ['whatsapp', 'brands'],
  ['calendar-alt', 'regular'],
  ...[
    'hotel', 'walking', 'plane-departure', 'angle-down', 'users', 'thumbs-up', 'star',
    'kaaba', 'check-circle', 'award', 'road', 'money-bill-wave', 'file-download',
    'dollar-sign', 'campground', 'praying-hands', 'hands-helping', 'hand-holding-heart',
    'building',
  ].map((n) => [n, 'solid']),
];

const entries = [];
for (const [name, style] of ICONS) {
  const url = `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/svgs/${style}/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) { console.error('GAGAL fetch', url, res.status); process.exit(1); }
  const svg = await res.text();
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const path = svg.match(/ d="([^"]+)"/)[1];
  entries.push(`  '${name}': { viewBox: '${viewBox}', path: '${path}' },`);
  console.log('ok', style, name);
}

const ts = `// AUTO-GENERATED oleh scripts/generate-fa-icons.mjs — JANGAN edit manual.
// Ikon: Font Awesome Free 5.15.4 — © Fonticons, Inc., lisensi CC BY 4.0
// https://fontawesome.com/license/free
export const FA_ICONS: Record<string, { viewBox: string; path: string }> = {
${entries.join('\n')}
};

// CSS sizing ikon SVG inline (meniru perilaku icon-font FA: 1em, ikut currentColor).
export const SVG_FA_CSS = 'svg.svg-fa{display:inline-block;height:1em;width:1em;vertical-align:-.125em;overflow:visible}';

// @font-face self-host (variable font, latin subset) — pengganti Google Fonts css2.
export const LANDING_FONT_CSS =
  "@font-face{font-family:'Inter';font-style:normal;font-weight:400 700;font-display:swap;src:url(/fonts/web/inter-var.woff2) format('woff2')}"
  + "@font-face{font-family:'Montserrat';font-style:normal;font-weight:500 800;font-display:swap;src:url(/fonts/web/montserrat-var.woff2) format('woff2')}";

// Preload font + preconnect CDN (href relatif — rewrite CDN membuatnya absolut).
export const FONT_PRELOAD_HTML =
  '<link rel="preload" href="/fonts/web/inter-var.woff2" as="font" type="font/woff2" crossorigin>'
  + '<link rel="preload" href="/fonts/web/montserrat-var.woff2" as="font" type="font/woff2" crossorigin>';

// Ganti <i class="fa? fa-xxx"></i> menjadi inline SVG (fill=currentColor, sizing 1em).
export function replaceFaIcons(html: string): string {
  return html.replace(/<i([^>]*)class="([^"]*\\bfa[bsr]\\b[^"]*)"([^>]*)><\\/i>/g, (m, _pre, cls) => {
    const tok = cls.split(/\\s+/).find((c: string) => c.startsWith('fa-'));
    const icon = tok ? FA_ICONS[tok.slice(3)] : undefined;
    if (!icon) return m; // ikon tak dikenal: biarkan apa adanya
    return '<svg class="' + cls + ' svg-fa" viewBox="' + icon.viewBox
      + '" aria-hidden="true" focusable="false"><path fill="currentColor" d="' + icon.path + '"/><' + '/svg>';
  });
}

// Rewrite asset relatif → Bunny CDN saat env BUNNY_CDN_HOSTNAME terisi.
// Template WAJIB tetap relatif (lihat memory proyek); absolutisasi hanya saat serve.
export function rewriteAssetsToCdn(html: string): string {
  const cdnHost = (process.env.BUNNY_CDN_HOSTNAME || '').trim();
  if (!cdnHost) return html;
  html = html.replace(/(["'(])\\/(wp-content|wp-includes|fonts)\\//g, '$1https://' + cdnHost + '/$2/');
  html = html.replace('<head>', '<head><link rel="preconnect" href="https://' + cdnHost + '" crossorigin>');
  return html;
}
`;
writeFileSync('functions/[slug]/fa-icons.ts', ts);
console.log('ditulis: functions/[slug]/fa-icons.ts,', ICONS.length, 'ikon');
