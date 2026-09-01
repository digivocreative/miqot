#!/usr/bin/env node
// Verifikasi invariants landing umroh & haji hasil transform.
// Build cepat (esbuild saja, tanpa vite) lalu render via onRequest.
// Pakai: npm run verify:landing
import { buildSync } from 'esbuild';
import { readFileSync } from 'fs';
import { trackingScriptError } from '../lib/landing-tracking-script.js';

const SLUG = 'bagas'; // phone 6287878573311 ≠ DEFAULT_PHONE → bisa assert rewrite CTA
const AGENT_NAME = 'Bagas Pramudita';
const PAGES = [
  {
    name: 'umroh',
    entry: 'functions/[slug]/umroh.ts',
    out: 'functions/umroh-landing.mjs',
    template: 'public/umroh.html',
    // Pembuangan section dipaku ke id Elementor. Kalau template di-ekspor ulang
    // dan id-nya berubah, regex pembuangnya jadi no-op TANPA galat.
    // Karena itu tiap aturan diperiksa DUA SISI: penandanya harus masih ADA di
    // template (kalau tidak, jangkarnya basi — assertion-nya jadi hampa dan
    // "lulus" tanpa menguji apa pun) dan harus HILANG di output. Penanda sengaja
    // memakai isi (teks/nama file), bukan id, karena id tetap muncul di CSS
    // per-widget walau section-nya sudah dibuang.
    // Penanda memakai nama file gambar, bukan teks judulnya: judul section juga
    // dikutip di komentar CSS blok tipografi mobile, jadi penanda berbasis teks
    // ikut "ketemu" di head dan bikin assertion gagal palsu.
    removals: [
      ['section voucher', /voucher-diskon-alhijaz-indowisata/],
      ['section footer pusat', /nikita-alhijaz-indowisata/],
      ['sticky bar lama (Fast Response)', /Konsultasi via WA \(Fast Response\)/],
      ['gambar ulasan 4-1', /2026\/03\/4-1\.avif/],
    ],
    extras: [
      ['tipografi mobile ikut terkirim', (h) => h.includes('id="alhijaz-mobile-typography"')],
      ['tombol Lihat Semua Keunggulan ada', (h) => h.includes('Lihat Semua Keunggulan')],
      // Penyetelan mobile pernah hidup di DUA tempat sekaligus — blok
      // alhijaz-mobile-typography di template dan salinan ber-!important yang
      // disuntik umroh.ts — dengan angka yang diam-diam berbeda. Invarian:
      // tidak boleh ada satu pun elemen yang diatur di kedua blok mobile.
      ['tak ada elemen diatur 2 blok mobile sekaligus', (h) => mobileRuleOverlap(h).length === 0,
        (h) => 'bentrok: ' + mobileRuleOverlap(h).join(', ')],
    ],
  },
  { name: 'haji', entry: 'functions/[slug]/haji.ts', out: 'functions/haji-landing.mjs' },
];

let failures = 0;
function check(page, label, ok, detail = '') {
  if (ok) console.log(`  ✅ [${page}] ${label}`);
  else { failures++; console.log(`  ❌ [${page}] ${label}${detail ? ' — ' + String(detail).slice(0, 160) : ''}`); }
}
function count(html, re) { return (html.match(re) || []).length; }

/** Semua <style> di output, dipisah jadi isi masing-masing. */
function styleBlocks(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}
/** Id elemen Elementor yang diatur di dalam blok @media mobile pada satu CSS. */
function mobileScopedIds(css) {
  const start = css.search(/@media\s*\(\s*max-width:\s*767px\s*\)/);
  if (start === -1) return new Set();
  // Ambil sampai penutup kurawal media query (nesting cuma 1 tingkat di sini).
  let depth = 0, i = css.indexOf('{', start), end = css.length;
  for (let j = i; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) { end = j; break; }
  }
  const body = css.slice(i, end);
  return new Set([...body.matchAll(/elementor-element-([0-9a-f]{6,})\b/g)].map((m) => m[1]));
}
/** Id yang diatur di blok mobile alhijaz-mobile-typography DAN di blok mobile lain. */
function mobileRuleOverlap(html) {
  const blocks = styleBlocks(html);
  const typo = blocks.find((b) => b.includes('Tipografi & spacing mobile'));
  if (!typo) return ['blok alhijaz-mobile-typography tidak ditemukan'];
  const owned = mobileScopedIds(typo);
  const others = blocks.filter((b) => b !== typo).flatMap((b) => [...mobileScopedIds(b)]);
  return [...new Set(others.filter((id) => owned.has(id)))];
}

for (const p of PAGES) {
  buildSync({ entryPoints: [p.entry], outfile: p.out, format: 'esm', platform: 'node', bundle: true });
}

for (const p of PAGES) {
  const mod = await import(new URL('../' + p.out, import.meta.url).href + '?t=' + Date.now());
  const render = async (agentOverride) =>
    (await mod.onRequest({ params: { slug: SLUG }, request: new Request('http://localhost/'), agentOverride })).text();

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
  // Router WA pusat: bentuk bawaan ekspor WordPress. Kalau lolos, semua lead
  // halaman agent mendarat di nomor pusat, bukan nomor agent.
  check(p.name, '0 router wa.alhijazindonesia.com tersisa', !html.includes('wa.alhijazindonesia.com'));
  check(p.name, 'sticky bar agent disuntik', /class="alhijaz-sticky"/.test(html) && html.includes(AGENT_NAME));
  check(p.name, 'FAB WhatsApp disuntik', /id="alhijazFab"/.test(html));
  check(p.name, '<title> memuat nama agent', new RegExp('<title>[^<]*' + AGENT_NAME).test(html));
  check(p.name, 'og:title memuat nama agent', new RegExp('og:title" content="[^"]*' + AGENT_NAME).test(html));
  check(p.name, 'script CAPI disuntik', html.includes('/api/capi/'));
  check(p.name, 'asset tetap relatif tanpa env (>10)', count(html, /(["'(])\/wp-content\//g) > 10);
  for (const [label, fn, detail] of p.extras || []) check(p.name, label, fn(html), detail ? detail(html) : '');
  if (p.removals?.length) {
    const template = readFileSync(new URL('../' + p.template, import.meta.url), 'utf-8');
    for (const [label, marker] of p.removals) {
      check(p.name, `jangkar "${label}" masih ada di template`, marker.test(template),
        'penanda hilang dari template — jangkar basi, uji pembuangannya jadi hampa');
      check(p.name, `${label} dibuang dari output`, !marker.test(html));
    }
  }

  // ── Tracking script agent (hanya tracker LPWA WatZap) ──
  // Snippet ditempel APA ADANYA sebelum </body>. Dua hal yang gampang rusak
  // diam-diam: (1) minify membuang komentar HTML — snippet resmi diawali
  // <!-- ... -->, jadi suntikan harus SESUDAH minify; (2) String.replace
  // menafsirkan $1/$& di replacement, dan query tracker memang bisa memuatnya.
  const TRACKING = '<!-- LPWA Tracker -->\n'
    + '<script src="https://secure.watzap.chat/wzp/v1/baxia.js?project=wzp_$1&amp;r=$&" '
    + 'data-wzp-project="wzp_$1"></script>';
  // Sampelnya harus benar-benar lolos validator — kalau tidak, yang diuji di
  // sini bentuk yang tak akan pernah sampai ke landing page.
  check(p.name, 'sampel tracking lolos validator', trackingScriptError(TRACKING) === null,
    trackingScriptError(TRACKING) || '');
  const withTracking = await render({
    name: AGENT_NAME, phone: '6287878573311', photo: '/agents/bagas.jpg',
    landing: { title: null, description: null, og_image_url: null, tracking_script: TRACKING },
  });
  check(p.name, 'tracking script tersuntik byte-exact', withTracking.includes(TRACKING),
    'komentar HTML / $1 / $& termakan — cek urutan suntik vs minify');
  check(p.name, 'tracking script tepat sebelum </body>',
    withTracking.indexOf(TRACKING) < withTracking.lastIndexOf('</body>')
    && withTracking.indexOf(TRACKING) > withTracking.indexOf('/api/capi/'));
  check(p.name, 'tanpa tracking script → tak ada sisa', !html.includes('watzap'));

  // Baris landing_config yang tersimpan sebelum aturan "hanya WatZap" berlaku
  // masih bisa memuat snippet vendor lain — gerbang di titik suntik yang
  // menahannya, bukan validasi saat menyimpan.
  const FOREIGN = "<script>fbq('init','1');</script>";
  const withForeign = await render({
    name: AGENT_NAME, phone: '6287878573311', photo: '/agents/bagas.jpg',
    landing: { title: null, description: null, og_image_url: null, tracking_script: FOREIGN },
  });
  check(p.name, 'snippet non-WatZap tersimpan lama tidak ikut disuntik',
    !withForeign.includes('fbq('), 'gerbang trackingScriptError di titik suntik jebol');

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
