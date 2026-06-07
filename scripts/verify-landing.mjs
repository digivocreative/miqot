#!/usr/bin/env node
// Verifikasi invariants landing umroh & haji hasil transform.
// Build cepat (esbuild saja, tanpa vite) lalu render via onRequest.
// Pakai: npm run verify:landing
import { buildSync } from 'esbuild';

const SLUG = 'bagas'; // phone 6287878573311 ≠ DEFAULT_PHONE → bisa assert rewrite CTA
const PAGES = [
  { name: 'umroh', entry: 'functions/[slug]/umroh.ts', out: 'functions/umroh-landing.mjs' },
  { name: 'haji', entry: 'functions/[slug]/haji.ts', out: 'functions/haji-landing.mjs' },
];

let failures = 0;
function check(page, label, ok, detail = '') {
  if (ok) console.log(`  ✅ [${page}] ${label}`);
  else { failures++; console.log(`  ❌ [${page}] ${label}${detail ? ' — ' + String(detail).slice(0, 160) : ''}`); }
}
function count(html, re) { return (html.match(re) || []).length; }

for (const p of PAGES) {
  buildSync({ entryPoints: [p.entry], outfile: p.out, format: 'esm', platform: 'node', bundle: true });
}

for (const p of PAGES) {
  const mod = await import(new URL('../' + p.out, import.meta.url).href + '?t=' + Date.now());
  const render = async () =>
    (await mod.onRequest({ params: { slug: SLUG }, request: new Request('http://localhost/') })).text();

  console.log(`\n=== ${p.name} (tanpa BUNNY_CDN_HOSTNAME) ===`);
  delete process.env.BUNNY_CDN_HOSTNAME;
  let html = await render();

  check(p.name, '0 alhijazindonesia.com', !/alhijazindonesia\.com/.test(html));
  check(p.name, '0 cdnjs.cloudflare.com', !/cdnjs\.cloudflare\.com/.test(html));
  check(p.name, '0 fonts.googleapis/gstatic', !/fonts\.(googleapis|gstatic)\.com/.test(html));
  // Widget div lottie inert sengaja dibiarkan (nesting); yang dilarang: script lottie & URL lottie absolut
  check(p.name, '0 script/URL lottie', !/<script[^>]*lottie/i.test(html) && !/https?:[^"' ]*lottie/i.test(html));
  const nonDeferred = (html.match(/<script [^>]*src="\/(wp-content|wp-includes)[^>]*>/g) || [])
    .filter((t) => !/\bdefer\b/.test(t));
  check(p.name, 'semua script first-party defer', nonDeferred.length === 0, nonDeferred[0]);
  check(p.name, '0 <i class="fa..."> tersisa', count(html, /<i[^>]*class="[^"]*\bfa[bsr]\b[^"]*"[^>]*><\/i>/g) === 0);
  check(p.name, 'ada ikon SVG hasil replace (>=5)', count(html, /<svg class="[^"]*\bfa[bsr]\b/g) >= 5);
  check(p.name, "@font-face inline Inter+Montserrat", /@font-face\{font-family:'Inter'/.test(html) && /@font-face\{font-family:'Montserrat'/.test(html));
  check(p.name, 'preload font woff2', /<link rel="preload"[^>]*as="font"[^>]*crossorigin/.test(html));
  check(p.name, 'preload hero image fetchpriority=high', /<link rel="preload"[^>]*as="image"[^>]*fetchpriority="high"/.test(html));
  check(p.name, 'CTA pakai nomor agent', html.includes('https://api.whatsapp.com/send?phone=6287878573311'));
  check(p.name, '0 wa.me default tersisa', !html.includes('wa.me/62822900020'));
  check(p.name, 'asset tetap relatif tanpa env (>10)', count(html, /(["'(])\/wp-content\//g) > 10);

  console.log(`=== ${p.name} (dengan BUNNY_CDN_HOSTNAME=cdn.test) ===`);
  process.env.BUNNY_CDN_HOSTNAME = 'cdn.test';
  html = await render();
  check(p.name, 'wp-content ter-rewrite ke CDN (>10)', count(html, /https:\/\/cdn\.test\/wp-content\//g) > 10);
  check(p.name, 'wp-includes ter-rewrite ke CDN (>=1)', count(html, /https:\/\/cdn\.test\/wp-includes\//g) >= 1);
  check(p.name, 'font ter-rewrite ke CDN (>=2)', count(html, /https:\/\/cdn\.test\/fonts\/web\//g) >= 2);
  check(p.name, '0 referensi relatif wp-* tersisa', count(html, /(["'(])\/(wp-content|wp-includes)\//g) === 0);
  check(p.name, 'preconnect ke CDN', html.includes('<link rel="preconnect" href="https://cdn.test"'));
  delete process.env.BUNNY_CDN_HOSTNAME;
}

console.log(failures === 0 ? '\nSEMUA PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
