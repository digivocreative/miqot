#!/usr/bin/env node
/**
 * Impor ulang template landing umroh dari ekspor WordPress alhijazindonesia.com
 * ke public/umroh.html, sambil MEMPERTAHANKAN modifikasi lokal yang wajib.
 *
 * Pakai:
 *   node scripts/import-umroh-template.mjs                 # tarik dari WordPress
 *   node scripts/import-umroh-template.mjs <file.html>     # dari file ekspor
 *   node scripts/import-umroh-template.mjs --dry-run       # jangan tulis, cuma laporkan
 *
 * CATATAN URL SUMBER: tanpa query string, WordPress mengembalikan versi hasil
 * optimasi flying-press (stylesheet pakai `data-href`, CSS di-inline ke cache
 * bundle) yang TIDAK bisa dipakai pipeline kita. Query apa pun mem-bypass cache
 * itu dan mengembalikan markup asli — karena itu URL default memakai ?nocache=1.
 *
 * Setiap aturan di bawah punya jumlah kecocokan yang DIHARAPKAN. Kalau ekspor
 * WordPress berubah bentuk sehingga sebuah aturan tidak lagi cocok, skrip ini
 * BERHENTI dengan galat — bukan diam-diam menghasilkan template setengah jadi.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL = 'https://alhijazindonesia.com/umroh/?nocache=1';
const OUT = resolve(ROOT, 'public/umroh.html');
const PATCH = (name) => readFileSync(resolve(ROOT, 'scripts/landing-patches/umroh', name), 'utf-8').trimEnd();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const inputFile = args.find((a) => !a.startsWith('--'));

let html = inputFile
  ? readFileSync(resolve(process.cwd(), inputFile), 'utf-8')
  : await fetch(SOURCE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => {
      if (!r.ok) throw new Error(`GET ${SOURCE_URL} → HTTP ${r.status}`);
      return r.text();
    });

console.log(`Sumber: ${inputFile || SOURCE_URL} (${html.length.toLocaleString('id-ID')} byte)`);

const problems = [];
/**
 * @param {string} label  keterangan aturan (muncul di log)
 * @param {RegExp|string} pattern
 * @param {string|Function} replacement
 * @param {number|'many'} expected  jumlah kecocokan yang diharapkan
 */
function rule(label, pattern, replacement, expected) {
  const re = typeof pattern === 'string'
    ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    : pattern;
  const hits = (html.match(re) || []).length;
  const ok = expected === 'many' ? hits > 0 : hits === expected;
  if (!ok) problems.push(`${label}: ${hits} kecocokan, diharapkan ${expected}`);
  html = html.replace(re, replacement);
  console.log(`  ${ok ? '✅' : '❌'} ${label} (${hits})`);
}

// ── 1. Link WhatsApp → wa.me + DEFAULT_PHONE ────────────────────────────────
// Wajib: functions/[slug]/umroh.ts menulis ulang pola wa.me/<digit> menjadi
// nomor agent. Bentuk WordPress (wa.alhijazindonesia.com router milik pusat)
// tidak boleh sampai ke halaman agent.
rule('CTA WhatsApp → wa.me/62822900020',
  /https:\/\/wa\.alhijazindonesia\.com\/\?message=/g,
  'https://wa.me/62822900020?text=', 13);
rule('Selector script pembersih link WA',
  'a[href*="wa.alhijazindonesia.com"]', 'a[href*="wa.me"]', 1);

// ── 2. Asset absolut → relatif ──────────────────────────────────────────────
// Wajib: rewriteAssetsToCdn() hanya mengenali path root-relative, dan template
// tidak boleh menarik apa pun dari situs lama.
rule('URL absolut (JSON escaped) → relatif', /https:\\\/\\\/alhijazindonesia\.com/g, '', 'many');
rule('URL absolut → relatif', /https:\/\/alhijazindonesia\.com/g, '', 'many');

// ── 3. Tracking pihak ketiga milik alhijazindonesia.com ─────────────────────
// Keputusan user 2026-06-07 (commit 0840237): GTM + Google Ads dicabut, jangan
// dikembalikan. FB Pixel SENGAJA dipertahankan (rantai fbp/fbc → CAPI).
rule('Google Tag Manager (noscript)',
  /<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->\n?/, '', 1);
rule('Google Tag Manager (head)',
  /<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->\n?/, '', 1);
rule('Google Ads gtag',
  /<!-- Google tag \(gtag\.js\) -->[\s\S]*?gtag\('config', 'AW-11338425233'\);\s*<\/script>\n?/, '', 1);

// ── 4. Bawaan WordPress yang tak relevan untuk halaman agent ────────────────
rule('Yoast JSON-LD', /<script type="application\/ld\+json" class="yoast-schema-graph">[\s\S]*?<\/script>\n?/, '', 1);
rule('shortlink', /<link rel='shortlink'[^>]*>\n?/, '', 1);
rule('eicons (tak dipakai halaman ini)', /<link rel='stylesheet' id='elementor-icons-css'[^>]*>\n?/, '', 1);
rule('flying-press', /<script[^>]*flying-press[^>]*>[\s\S]*?<\/script>\n?/g, '', 2);
rule('lottie.min.js', /<script id="lottie-js"[^>]*><\/script>\n?/, '', 1);
// Inline sebelum jQuery (yang kini defer) → ReferenceError di konsol.
rule('jQuery.uiBackCompat inline', /<script id="jquery-ui-core-js-before">[\s\S]*?<\/script>\n?/, '', 1);

// ── 5. Google Fonts: pangkas ke keluarga yang benar-benar dipakai ───────────
// (transform agent membuangnya sama sekali dan memakai font self-host; ini
// untuk halaman statis public/umroh.html saja.)
rule('Google Fonts dipangkas', /<link rel='stylesheet' id='google-fonts-1-css'[^>]*>/, PATCH('google-fonts.html'), 1);

// ── 6. Script show-more "Lihat Semua Keunggulan" → vanilla JS ───────────────
// Versi WordPress memanggil jQuery.noConflict() padahal jQuery baru dimuat di
// akhir body (dan kini defer) → ReferenceError, tombol tak pernah muncul dan
// blok keunggulan terkunci 215px di mobile.
rule('show-more jQuery → vanilla',
  /<script type="text\/javascript">\s*var \$jQuerySelf = jQuery\.noConflict\(\);[\s\S]*?<\/script>/,
  () => PATCH('showmore.html'), 1);

// ── 7. Semua script first-party jadi defer ──────────────────────────────────
// Dijaga oleh assertion di scripts/verify-landing.mjs.
rule('defer pada script first-party',
  /<script((?:(?!\bdefer\b)[^>])*?\ssrc="\/(?:wp-content|wp-includes)[^"]*"(?:(?!\bdefer\b)[^>])*)>/g,
  '<script defer$1>', 'many');

// ── 8. Cache-bust elementor frontend.min.js ─────────────────────────────────
// public/wp-content/.../frontend.min.js ditambal lokal: regex lightbox menerima
// .avif (galeri Dokumentasi Jamaah memakai .avif). Suffix -avif memisahkan
// cache Bunny dari file upstream yang tidak ditambal.
rule('cache-bust frontend.min.js (patch avif)',
  'assets/js/frontend.min.js?ver=3.17.2"', 'assets/js/frontend.min.js?ver=3.17.2-avif"', 1);

// ── 9. Gambar perlengkapan umroh: sudah diunggah manual ke Bunny ────────────
for (const page of ['0006', '0007']) {
  rule(`perlengkapan page-${page} → Bunny`,
    `/wp-content/uploads/2026/04/KATALOG-NEW-UPDATE-APRIL-26_page-${page}.avif`,
    `https://alhijaz.b-cdn.net/landing/perlengkapan-umroh-2026-page-${page}.avif`, 1);
}

// ── 10. Tipografi mobile ────────────────────────────────────────────────────
// Melengkapi blok @media bawaan Elementor yang tidak lengkap; harus jadi
// stylesheet TERAKHIR di head supaya menang lewat urutan kaskade.
rule('tipografi mobile disisipkan', /<\/head>/, () => `${PATCH('mobile-typography.html')}\n</head>`, 1);

// ── Invarian akhir ──────────────────────────────────────────────────────────
const invariants = [
  ['0 alhijazindonesia.com (selain wa.*)', !/(?<!wa\.)alhijazindonesia\.com/.test(html)],
  ['0 wa.alhijazindonesia.com', !html.includes('wa.alhijazindonesia.com')],
  ['CTA wa.me ada (>=13)', (html.match(/https:\/\/wa\.me\/62822900020\?text=/g) || []).length >= 13],
  ['judul masih dikenali transform', html.includes('<title>Paket Umroh | Travel Umroh Terbaik | PT Alhijaz Indowisata</title>')],
  ['hero 64c34f3d ada (jangkar sticky bar)', html.includes('elementor-element-64c34f3d')],
  ['gambar promo penanda eager ada', html.includes('umroh-promo-alhijaz-indowisata')],
  ['blok tipografi mobile ada', html.includes('id="alhijaz-mobile-typography"')],
  ['tombol Lihat Semua Keunggulan ada', html.includes('Lihat Semua Keunggulan')],
];
console.log('\nInvarian:');
for (const [label, ok] of invariants) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) problems.push(`invarian gagal: ${label}`);
}

if (problems.length) {
  console.error(`\n${problems.length} masalah:\n  - ${problems.join('\n  - ')}`);
  console.error('\nTemplate TIDAK ditulis. Sesuaikan aturan di skrip ini dengan bentuk ekspor terbaru.');
  process.exit(1);
}

if (dryRun) {
  console.log(`\n--dry-run: hasil ${html.length.toLocaleString('id-ID')} byte, tidak ditulis.`);
} else {
  writeFileSync(OUT, html);
  console.log(`\nDitulis: public/umroh.html (${html.length.toLocaleString('id-ID')} byte)`);
}
