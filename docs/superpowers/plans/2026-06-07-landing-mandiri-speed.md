# Landing Mandiri + Ngebut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing /umroh & /haji-plus bebas dependensi alhijazindonesia.com/cdnjs/Google Fonts, asset berat di Bunny CDN (custom domain tidak lewat Cloudflare), critical render path dioptimasi (defer, hapus lottie, preload LCP), origin ber-compression + immutable cache.

**Architecture:** Template `public/*.html` tetap ber-URL relatif (constraint memory); semua rewrite CDN/font/ikon terjadi saat serve di transform `functions/[slug]/{umroh,haji}.ts` (sumber TS — `.mjs` adalah build artifact untracked, esbuild perlu `bundle:true` karena ada import modul baru `fa-icons.ts`). Verifikasi via script integrasi `scripts/verify-landing.mjs` (build cepat esbuild → panggil `onRequest` → assert invariants).

**Tech Stack:** Node ESM, esbuild (sudah devDep), express + compression (baru), Bunny Storage API (pola `bunnyUpload` existing), Font Awesome Free 5.15.4 SVG (CC BY 4.0), Google Fonts woff2 (di-vendor sekali).

**Konstanta penting:**
- `DEFAULT_PHONE = '62822900020'` (sudah ada di kedua .ts)
- Slug test: `bagas` (phone `6287878573311` ≠ DEFAULT_PHONE → bisa assert rewrite)
- Hero umroh: section `64c34f3d`, bg `/wp-content/uploads/2024/09/pt-alhijaz-indowisata.webp`
- Hero haji: section `f55e3ca` (bg dicari di Task 7 step 1)
- Ikon (21): brands: `whatsapp`; regular: `calendar-alt`; solid: `hotel, walking, plane-departure, angle-down, users, thumbs-up, star, kaaba, check-circle, award, road, money-bill-wave, file-download, dollar-sign, campground, praying-hands, hands-helping, hand-holding-heart, building`

---

### Task 0: Pre-flight — catat WIP user & baseline

**Files:** tidak ada (read-only)

- [ ] **Step 1:** `git branch --show-current` → harus `main`. `git stash list | head -3` → catat.
- [ ] **Step 2:** `git diff public/umroh.html | head -100` dan `git diff --stat public/` → **catat hunk WIP user** (memory: WIP menahun, commit harus staging selektif; `public/wp-content/plugins/elementor/assets/js/frontend.min.js` JANGAN di-stage). Jika hunk WIP ada di `public/umroh.html`, dokumentasikan — akan ikut ter-commit bersama edit kita (file yang sama); laporkan di ringkasan akhir.
- [ ] **Step 3:** Simpan baseline render: `node -e` panggilan belum ada — cukup `curl -s --compressed https://alhijaz.co/nikita/umroh -o /tmp/baseline-umroh.html` dan `curl -s --compressed https://alhijaz.co/nikita/haji -o /tmp/baseline-haji.html` (pembanding visual/regresi).

### Task 1: Verification harness (test dulu — merah)

**Files:**
- Create: `scripts/verify-landing.mjs`
- Modify: `package.json` (build script + `verify:landing`)

- [ ] **Step 1:** Ubah build script di `package.json` — tambah `bundle:true` pada kedua esbuild call (WAJIB sebelum ada import antar-modul di .ts):

```json
"build": "vite build && node -e \"const e=require('esbuild');e.buildSync({entryPoints:['functions/[slug]/umroh.ts'],outfile:'functions/umroh-landing.mjs',format:'esm',platform:'node',bundle:true});e.buildSync({entryPoints:['functions/[slug]/haji.ts'],outfile:'functions/haji-landing.mjs',format:'esm',platform:'node',bundle:true})\"",
"verify:landing": "node scripts/verify-landing.mjs"
```

- [ ] **Step 2:** Tulis `scripts/verify-landing.mjs`:

```js
#!/usr/bin/env node
// Verifikasi invariants landing umroh & haji hasil transform.
// Build cepat (esbuild sahaja, tanpa vite) lalu render via onRequest.
import { buildSync } from 'esbuild';

const SLUG = 'bagas'; // phone 6287878573311 ≠ DEFAULT_PHONE
const PAGES = [
  { name: 'umroh', entry: 'functions/[slug]/umroh.ts', out: 'functions/umroh-landing.mjs' },
  { name: 'haji', entry: 'functions/[slug]/haji.ts', out: 'functions/haji-landing.mjs' },
];

let failures = 0;
function check(page, label, ok, detail = '') {
  if (ok) { console.log(`  ✅ [${page}] ${label}`); }
  else { failures++; console.log(`  ❌ [${page}] ${label}${detail ? ' — ' + detail : ''}`); }
}
function count(html, re) { return (html.match(re) || []).length; }

async function render(out) {
  const mod = await import(`../${out}?t=${Date.now()}`.replace('../', new URL('..', import.meta.url).href));
  const res = await mod.onRequest({ params: { slug: SLUG }, request: new Request('http://localhost/') });
  return res.text();
}

for (const p of PAGES) {
  buildSync({ entryPoints: [p.entry], outfile: p.out, format: 'esm', platform: 'node', bundle: true });
}

for (const p of PAGES) {
  console.log(`\n=== ${p.name} (tanpa BUNNY_CDN_HOSTNAME) ===`);
  delete process.env.BUNNY_CDN_HOSTNAME;
  let html = await render(p.out);

  check(p.name, '0 alhijazindonesia.com', !/alhijazindonesia\.com/.test(html));
  check(p.name, '0 cdnjs.cloudflare.com', !/cdnjs\.cloudflare\.com/.test(html));
  check(p.name, '0 fonts.googleapis/gstatic', !/fonts\.(googleapis|gstatic)\.com/.test(html));
  check(p.name, '0 lottie', !/lottie/i.test(html));
  const nonDeferred = (html.match(/<script [^>]*src="\/(wp-content|wp-includes)[^>]*>/g) || [])
    .filter((t) => !/\bdefer\b/.test(t));
  check(p.name, 'semua script first-party defer', nonDeferred.length === 0, nonDeferred[0]);
  check(p.name, '0 <i class="fa..."> tersisa', count(html, /<i[^>]*class="[^"]*\bfa[bsr]\b[^"]*"[^>]*><\/i>/g) === 0);
  check(p.name, 'ada ikon SVG hasil replace', count(html, /<svg class="[^"]*\bfa[bsr]\b/g) >= 5);
  check(p.name, '@font-face inline Inter+Montserrat', /@font-face\{font-family:'Inter'/.test(html) && /@font-face\{font-family:'Montserrat'/.test(html));
  check(p.name, 'preload font woff2', /<link rel="preload"[^>]*as="font"[^>]*crossorigin/.test(html));
  check(p.name, 'preload hero image', /<link rel="preload"[^>]*as="image"[^>]*fetchpriority="high"/.test(html));
  check(p.name, 'CTA pakai nomor agent', html.includes('https://api.whatsapp.com/send?phone=6287878573311'));
  check(p.name, '0 wa.me default tersisa', !html.includes('wa.me/62822900020'));
  check(p.name, 'asset tetap relatif tanpa env', count(html, /(["'(])\/wp-content\//g) > 10);

  console.log(`=== ${p.name} (dengan BUNNY_CDN_HOSTNAME=cdn.test) ===`);
  process.env.BUNNY_CDN_HOSTNAME = 'cdn.test';
  html = await render(p.out);
  check(p.name, 'wp-content ter-rewrite ke CDN', count(html, /https:\/\/cdn\.test\/wp-content\//g) > 10);
  check(p.name, 'wp-includes ter-rewrite ke CDN', count(html, /https:\/\/cdn\.test\/wp-includes\//g) >= 1);
  check(p.name, 'font ter-rewrite ke CDN', count(html, /https:\/\/cdn\.test\/fonts\/web\//g) >= 2);
  check(p.name, '0 referensi relatif wp-* tersisa', count(html, /(["'(])\/(wp-content|wp-includes)\//g) === 0);
  check(p.name, 'preconnect ke CDN', html.includes('<link rel="preconnect" href="https://cdn.test"'));
}

console.log(failures === 0 ? '\nSEMUA PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

Catatan import cache-bust: gunakan `await import(new URL('../' + p.out, import.meta.url).href + '?t=' + Date.now())` — sederhanakan saat implementasi bila bentuk di atas canggung; yang penting modul di-reimport segar per build (atau render kedua memakai env yang diubah SEBELUM import pertama — env dibaca saat generateHTML jalan, bukan saat import, jadi satu import cukup; sederhanakan: import sekali, panggil onRequest dua kali dengan env berbeda).

- [ ] **Step 3:** Jalankan `npm run verify:landing` → **harus FAIL** (banyak ❌: masih ada cdnjs, fonts.googleapis, tanpa defer, dst). Catat daftar fail sebagai baseline merah.
- [ ] **Step 4:** Commit harness: `git add scripts/verify-landing.mjs package.json && git commit -m "test(landing): harness verifikasi invariants landing mandiri"`

### Task 2: Vendor font woff2 (Inter + Montserrat latin)

**Files:**
- Create: `scripts/download-fonts.mjs`, `public/fonts/web/*.woff2` (8 file)

- [ ] **Step 1:** Tulis `scripts/download-fonts.mjs`:

```js
#!/usr/bin/env node
// Vendor woff2 latin subset dari Google Fonts (sekali jalan, hasil di-commit).
import { mkdirSync, writeFileSync } from 'fs';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FAMILIES = [
  ['Inter', [400, 500, 600, 700]],
  ['Montserrat', [500, 600, 700, 800]],
];
mkdirSync('public/fonts/web', { recursive: true });
for (const [fam, weights] of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(';')}&display=swap`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  // Blok per subset diawali komentar /* latin */ — ambil hanya latin.
  const blocks = css.split('@font-face').slice(1);
  for (const b of blocks) {
    if (!/U\+0000-00FF/.test(b)) continue; // latin subset
    const w = b.match(/font-weight:\s*(\d+)/)[1];
    const u = b.match(/url\((https:[^)]+\.woff2)\)/)[1];
    const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
    const f = `public/fonts/web/${fam.toLowerCase()}-${w}.woff2`;
    writeFileSync(f, buf);
    console.log(f, buf.length, 'bytes');
  }
}
```

- [ ] **Step 2:** `node scripts/download-fonts.mjs` → harus tercipta 8 file `inter-{400,500,600,700}.woff2` + `montserrat-{500,600,700,800}.woff2`, masing-masing ~20-40KB. Verifikasi: `ls -la public/fonts/web/ | wc -l` = 8 file (+2 entri dir).
- [ ] **Step 3:** Commit: `git add scripts/download-fonts.mjs public/fonts/web && git commit -m "feat(landing): vendor woff2 Inter+Montserrat latin (self-host, lepas Google Fonts)"`

### Task 3: Generate modul ikon SVG

**Files:**
- Create: `scripts/generate-fa-icons.mjs`, `functions/[slug]/fa-icons.ts`

- [ ] **Step 1:** Tulis `scripts/generate-fa-icons.mjs`:

```js
#!/usr/bin/env node
// Generate functions/[slug]/fa-icons.ts dari SVG Font Awesome Free 5.15.4 (cdnjs).
import { writeFileSync } from 'fs';
const ICONS = [
  ['whatsapp', 'brands'], ['calendar-alt', 'regular'],
  ...['hotel', 'walking', 'plane-departure', 'angle-down', 'users', 'thumbs-up', 'star',
     'kaaba', 'check-circle', 'award', 'road', 'money-bill-wave', 'file-download',
     'dollar-sign', 'campground', 'praying-hands', 'hands-helping', 'hand-holding-heart',
     'building'].map((n) => [n, 'solid']),
];
const entries = [];
for (const [name, style] of ICONS) {
  const url = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/svgs/${style}/${name}.svg`;
  const svg = await (await fetch(url)).text();
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

// Ganti <i class="fa? fa-xxx"></i> menjadi inline SVG (fill=currentColor, sizing 1em).
export function replaceFaIcons(html: string): string {
  return html.replace(/<i([^>]*)class="([^"]*\\bfa[bsr]\\b[^"]*)"([^>]*)><\\/i>/g, (m, pre, cls, post) => {
    const tok = cls.split(/\\s+/).find((c: string) => c.startsWith('fa-'));
    const icon = tok ? FA_ICONS[tok.slice(3)] : undefined;
    if (!icon) return m; // ikon tak dikenal: biarkan apa adanya
    return '<svg class="' + cls + ' svg-fa" viewBox="' + icon.viewBox
      + '" aria-hidden="true" focusable="false"><path fill="currentColor" d="' + icon.path + '"/><' + '/svg>';
  });
}
`;
writeFileSync('functions/[slug]/fa-icons.ts', ts);
console.log('ditulis: functions/[slug]/fa-icons.ts,', ICONS.length, 'ikon');
```

- [ ] **Step 2:** `node scripts/generate-fa-icons.mjs` → 21 baris "ok", file `functions/[slug]/fa-icons.ts` tercipta. Spot-check: `grep -c "viewBox" "functions/[slug]/fa-icons.ts"` = 21.
- [ ] **Step 3:** Commit: `git add scripts/generate-fa-icons.mjs "functions/[slug]/fa-icons.ts" && git commit -m "feat(landing): modul ikon FA inline-SVG (21 ikon, lepas cdnjs)"`

### Task 4: Template umroh.html — defer, hapus lottie, CTA wa.me

**Files:**
- Modify: `public/umroh.html` (PERHATIAN: ada WIP user di file ini — jangan revert apa pun yang sudah ada)

- [ ] **Step 1:** Tambah `defer` ke semua script footer first-party. Cari blok `<script type="text/javascript" src="/wp-...` (±baris 2436-2461) — untuk SETIAP tag (flying-press vitals, jquery, e-gallery, webpack×2, frontend-modules, jquery.sticky, elementor-pro frontend, waypoints, jquery-ui core, elementor frontend, elements-handlers, landingpress; KECUALI lottie yang akan dihapus): ubah `<script type="text/javascript" src=` → `<script defer type="text/javascript" src=`. Gunakan perintah:

```bash
perl -i -pe 's{<script type="text/javascript" src="(/wp-(?:content|includes)/(?!.*lottie)[^"]*)"}{<script defer type="text/javascript" src="$1"}g' public/umroh.html
```

- [ ] **Step 2:** Hapus baris script lottie (cari `lottie-js`): hapus tag `<script type="text/javascript" src="/wp-content/plugins/elementor-pro/assets/lib/lottie/lottie.min.js?ver=5.6.6" id="lottie-js"></script>` seluruhnya. Widget lottie (div `data-widget_type="lottie.default"`) DIBIARKAN (tanpa lib tidak merender apa pun; menghapus div berisiko merusak nesting — sesuai komentar di umroh.ts).
- [ ] **Step 3:** Ganti CTA: `perl -i -pe 's{https://wa\.alhijazindonesia\.com/\?message=}{https://wa.me/62822900020?text=}g' public/umroh.html` lalu cek sisa: `grep -c 'wa.alhijazindonesia' public/umroh.html`. Jika masih ada (bentuk bare link atau inline script cleaner `a[href*="wa.alhijazindonesia.com"]`), update juga ke `wa.me` (selector cleaner → `a[href*="wa.me"]`).
- [ ] **Step 4:** Verifikasi cepat: `grep -c 'defer type' public/umroh.html` (≈13), `grep -c lottie public/umroh.html` (hanya sisa widget div, script 0), `grep -c 'wa.alhijazindonesia' public/umroh.html` (0).
- [ ] **Step 5:** Commit (file ini saja): `git add public/umroh.html && git commit -m "feat(umroh-landing): defer chain JS, hapus lottie.min.js, CTA standalone wa.me"` — sebutkan di body commit bila hunk WIP user ikut.

### Task 5: Template haji-plus.html — perlakuan sama

**Files:**
- Modify: `public/haji-plus.html`

- [ ] **Step 1:** Sama dengan Task 4 step 1 (perl defer) pada `public/haji-plus.html`.
- [ ] **Step 2:** Cek lottie: `grep -n lottie public/haji-plus.html` — jika ada script tag, hapus; jika hanya widget/CSS, biarkan.
- [ ] **Step 3:** CTA: perintah perl sama (Task 4 step 3) + update inline script baris ±1235 `a[href*="wa.alhijazindonesia.com"]` → `a[href*="wa.me"]`. Sisa `wa.alhijazindonesia` harus 0.
- [ ] **Step 4:** Commit: `git add public/haji-plus.html && git commit -m "feat(haji-landing): defer chain JS, CTA standalone wa.me"`

### Task 6: Transform umroh.ts — font inline, SVG ikon, preload, rewrite CDN

**Files:**
- Modify: `functions/[slug]/umroh.ts`

- [ ] **Step 1:** Tambah import di atas (baris ~7): `import { replaceFaIcons } from './fa-icons';`
- [ ] **Step 2:** Update CTA regex (baris ~143-145) ke pola wa.me:

```ts
html = html.replace(/https:\/\/wa\.me\/\d+\?text=([^"]*)/g, waBase + '&text=$1');
html = html.replace(/https:\/\/wa\.me\/\d+(?=["'])/g, waBase + '&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20Paket%20Umroh%20di%20Alhijaz');
```

- [ ] **Step 3:** Ganti blok inject `</head>` (baris ~198-242): hapus preconnect fonts.googleapis/gstatic + link css2 + link cdnjs FA; ganti dengan (pertahankan seluruh `<style>` overrides yang sudah ada — `.elementor-1291 ...` dst tetap):

```ts
const FONT_CSS = ([[ 'Inter', [400, 500, 600, 700]], ['Montserrat', [500, 600, 700, 800]]] as const)
  .map(([fam, ws]) => ws.map((w) =>
    `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(/fonts/web/${fam.toLowerCase()}-${w}.woff2) format('woff2')}`
  ).join('')).join('');
const SVG_FA_CSS = 'svg.svg-fa{display:inline-block;height:1em;width:1em;vertical-align:-.125em;overflow:visible}';
html = html.replace(
  '</head>',
  '<link rel="preload" href="/fonts/web/inter-600.woff2" as="font" type="font/woff2" crossorigin>'
  + '<link rel="preload" href="/fonts/web/montserrat-700.woff2" as="font" type="font/woff2" crossorigin>'
  + '<link rel="preload" href="/wp-content/uploads/2024/09/pt-alhijaz-indowisata.webp" as="image" fetchpriority="high">'
  + '<st' + 'yle>' + FONT_CSS + SVG_FA_CSS
  + /* ...seluruh isi style overrides existing dipertahankan apa adanya... */
  + '</st' + 'yle>\n'
  + '<' + '/head>'
);
```

(Catatan: preload href relatif — rewrite CDN di step 6 yang membuatnya absolut, konsisten dengan asset lain.)

- [ ] **Step 4:** Panggil ikon replace setelah blok struktur template (setelah baris ~308 robots, sebelum bagian PERFORMANCE): `html = replaceFaIcons(html);`
- [ ] **Step 5:** Sebelum blanket lazy (baris ~317), amankan LCP sekunder (promo milad eager):

```ts
html = html.replace(/(<img(?![^>]*loading=)[^>]*umroh-promo-milad[^>]*?)(\/?>)/, '$1 loading="eager" fetchpriority="high" $2');
```

- [ ] **Step 6:** Di AKHIR generateHTML, sebelum blok MINIFY (baris ~347), tambah rewrite CDN + preconnect:

```ts
// ── Bunny CDN rewrite (env-gated; tanpa env tetap self-hosted/relatif) ──
const cdnHost = (process.env.BUNNY_CDN_HOSTNAME || '').trim();
if (cdnHost) {
  html = html.replace(/(["'(])\/(wp-content|wp-includes|fonts)\//g, '$1https://' + cdnHost + '/$2/');
  html = html.replace('<head>', '<head><link rel="preconnect" href="https://' + cdnHost + '" crossorigin>');
}
```

- [ ] **Step 7:** `npm run verify:landing` → bagian umroh harus mulai hijau (haji masih merah). Perbaiki sampai semua assertion umroh PASS.
- [ ] **Step 8:** Commit: `git add "functions/[slug]/umroh.ts" && git commit -m "feat(umroh-landing): font self-host, ikon inline-SVG, preload LCP, rewrite Bunny CDN"`

### Task 7: Transform haji.ts — perlakuan sama

**Files:**
- Modify: `functions/[slug]/haji.ts`

- [ ] **Step 1:** Tentukan hero LCP haji: `grep -o 'elementor-element-f55e3ca[^}]*background-image:url("[^"]*"' public/haji-plus.html` (atau cari bg section pertama di inline CSS). Catat URL → pakai untuk preload.
- [ ] **Step 2:** Terapkan langkah identik Task 6 step 1-6 pada `haji.ts` (import, CTA wa.me dengan teks default haji yang sudah ada di file, head inject FONT_CSS+SVG_FA_CSS+preload font, preload hero hasil step 1, `replaceFaIcons`, rewrite CDN env-gated; pertahankan style overrides existing `.elementor-2333 ...`). Jangan duplikasi konstanta bila bisa diekspor dari `fa-icons.ts` — pindahkan `FONT_CSS`/`SVG_FA_CSS` ke `fa-icons.ts` sebagai export (`export const LANDING_FONT_CSS`, `export const SVG_FA_CSS`) dan import dari kedua file (DRY).
- [ ] **Step 3:** `npm run verify:landing` → SEMUA PASS (umroh + haji, dengan & tanpa env).
- [ ] **Step 4:** Commit: `git add "functions/[slug]/haji.ts" "functions/[slug]/fa-icons.ts" && git commit -m "feat(haji-landing): font self-host, ikon inline-SVG, preload LCP, rewrite Bunny CDN"`

### Task 8: Origin hardening — compression + immutable static

**Files:**
- Modify: `server.js` (import atas + baris ~255 + baris 14776-14777), `package.json` (dep)

- [ ] **Step 1:** `npm install compression` (cek `git diff package.json` hanya menambah dep).
- [ ] **Step 2:** Cek SSE: `grep -n 'text/event-stream' server.js` — catat ada/tidak.
- [ ] **Step 3:** Tambah di blok import server.js: `import compression from 'compression';` lalu sebelum `app.use(express.json({ limit: '10mb' }))` (baris ~255):

```js
// Kompresi origin — penting untuk custom domain yang tidak lewat proxy Cloudflare.
app.use(compression({
  filter: (req, res) => {
    const ct = String(res.getHeader('Content-Type') || '');
    if (ct.includes('text/event-stream')) return false; // jangan buffer SSE
    return compression.filter(req, res);
  },
}));
```

- [ ] **Step 4:** Ubah baris 14776-14777:

```js
app.use(express.static(distPath, { index: false, maxAge: '30d', immutable: true }));
app.use(express.static(publicPath, { index: false, maxAge: '30d', immutable: true }));
```

- [ ] **Step 5:** Smoke test: `PORT=3456 node server.js` (background, tunggu boot) → `curl -sI -H 'Accept-Encoding: gzip' http://localhost:3456/bagas/umroh | grep -i 'content-encoding\|cache-control'` harus `gzip` + `max-age=3600`; `curl -sI http://localhost:3456/wp-includes/js/jquery/jquery.min.js?ver=3.7.1 | grep -i cache-control` harus `max-age=2592000, immutable`. Matikan server.
- [ ] **Step 6:** Commit: `git add server.js package.json package-lock.json && git commit -m "perf(server): compression + immutable cache pada static origin (custom domain tanpa CF)"`

### Task 9: Script sync asset ke Bunny

**Files:**
- Create: `scripts/sync-landing-assets.mjs`
- Modify: `.gitignore` (tambah `functions/haji-landing.mjs` bila belum ada)

- [ ] **Step 1:** Tulis `scripts/sync-landing-assets.mjs`:

```js
#!/usr/bin/env node
// Sync asset statis landing ke Bunny Storage (path identik dengan public/).
// Env wajib: BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE, BUNNY_CDN_HOSTNAME
// Opsional: BUNNY_STORAGE_HOSTNAME (default storage.bunnycdn.com), --force (overwrite semua)
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const KEY = process.env.BUNNY_STORAGE_API_KEY;
const ZONE = process.env.BUNNY_STORAGE_ZONE;
const STORAGE = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const CDN = process.env.BUNNY_CDN_HOSTNAME;
const FORCE = process.argv.includes('--force');
if (!KEY || !ZONE || !CDN) { console.error('Env BUNNY_STORAGE_API_KEY/BUNNY_STORAGE_ZONE/BUNNY_CDN_HOSTNAME wajib.'); process.exit(1); }

const ROOTS = ['public/wp-content', 'public/wp-includes', 'public/fonts'];
const MIME = { '.css': 'text/css', '.js': 'application/javascript', '.avif': 'image/avif', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.json': 'application/json', '.ico': 'image/x-icon' };

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

const files = ROOTS.flatMap((r) => { try { return [...walk(r)]; } catch { return []; } });
console.log(files.length, 'file kandidat');
let uploaded = 0, skipped = 0, failed = 0;
const queue = [...files];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const key = relative('public', f).split('\\').join('/');
    const size = statSync(f).size;
    if (!FORCE) {
      try {
        const head = await fetch(`https://${CDN}/${key}`, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        if (head.ok && Number(head.headers.get('content-length')) === size) { skipped++; continue; }
      } catch { /* lanjut upload */ }
    }
    const res = await fetch(`https://${STORAGE}/${ZONE}/${key}`, {
      method: 'PUT',
      headers: { AccessKey: KEY, 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' },
      body: readFileSync(f),
    });
    if (res.ok) { uploaded++; console.log('↑', key); } else { failed++; console.error('GAGAL', res.status, key); }
  }
}));
console.log(`selesai: ${uploaded} upload, ${skipped} skip, ${failed} gagal`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2:** Cek `.gitignore` punya `functions/haji-landing.mjs`; jika belum, tambahkan di bawah baris `functions/umroh-landing.mjs`.
- [ ] **Step 3:** Dry-sanity tanpa kredensial: `node scripts/sync-landing-assets.mjs` → harus exit 1 dengan pesan env wajib (bukan crash).
- [ ] **Step 4:** Commit: `git add scripts/sync-landing-assets.mjs .gitignore && git commit -m "feat(landing): script sync asset statis ke Bunny Storage"`

### Task 10: Build penuh + verifikasi visual

**Files:** tidak ada perubahan baru (build + screenshot)

- [ ] **Step 1:** `npm run build` → sukses; `npm run verify:landing` → SEMUA PASS.
- [ ] **Step 2:** Jalankan server lokal `PORT=3456 node server.js`, lalu screenshot kedua halaman dengan playwright (chromium sudah terinstal):

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  for (const path of ['bagas/umroh', 'bagas/haji']) {
    await p.goto('http://localhost:3456/' + path, { waitUntil: 'networkidle' });
    await p.screenshot({ path: '/tmp/' + path.replace('/', '-') + '-mobile.png', fullPage: true });
  }
  await b.close();
})()"
```

- [ ] **Step 3:** Inspeksi screenshot (Read tool): ikon WhatsApp/hotel/pesawat tampil (SVG), font Inter/Montserrat ter-render (bukan serif fallback), hero & sticky bar utuh, dibandingkan baseline `/tmp/baseline-*.html` look produksi.
- [ ] **Step 4:** Cek console error: tambahkan listener `page.on('console')`/`page.on('pageerror')` pada script step 2 bila perlu rerun — tidak boleh ada ReferenceError (indikasi defer memecah dependensi).
- [ ] **Step 5:** Matikan server. Commit sisa (bila ada perubahan tertinggal) dengan staging selektif.

### Task 11: Laporan & instruksi deploy (user action items)

- [ ] **Step 1:** Tulis ringkasan ke user berisi urutan deploy VPS:
  1. `git pull && npm install && npm run build`
  2. Set env service: `BUNNY_CDN_HOSTNAME=alhijaz.b-cdn.net` (plus kredensial storage bila belum)
  3. `node scripts/sync-landing-assets.mjs` (pertama kali ~7.6MB)
  4. Restart service (`systemctl restart miqot` sesuai setup)
  5. Panel Bunny pull zone: aktifkan header CORS (`Access-Control-Allow-Origin: *`) untuk `.woff2` — wajib agar font cross-origin termuat
  6. Verifikasi live: `curl -sI https://alhijaz.b-cdn.net/fonts/web/inter-600.woff2` (200 + access-control-allow-origin), buka halaman custom domain & alhijaz.co, cek font/ikon, PageSpeed Insights sebelum-sesudah
  7. Opsional (rekomendasi audit): Cloudflare Cache Rule `/wp-content/*` Eligible for cache untuk alhijaz.co
- [ ] **Step 2:** Laporkan hunk WIP user yang ikut ter-commit di `public/umroh.html` (dari Task 0), file yang sengaja tidak di-stage (`public/wp-content/plugins/elementor/assets/js/frontend.min.js`), dan update memory proyek.

## Self-Review (sudah dijalankan)

- **Spec coverage:** §1 asset Bunny → Task 9+6.6/7; §2 font → Task 2+6.3; §3 ikon → Task 3+6.4; §4 critical path → Task 4/5 (defer+lottie) + 6.3/6.5/6.6 (preload/preconnect/eager); §5 CTA → Task 4.3/5.3+6.2; §6 hardening → Task 8; §7 build/deploy → Task 10/11; verifikasi → Task 1+10. ✓
- **Placeholder scan:** tidak ada TBD; hero haji ditentukan Task 7 step 1 dengan perintah eksplisit. ✓
- **Type consistency:** `replaceFaIcons(html: string): string` dipakai konsisten Task 3/6/7; `FONT_CSS`/`SVG_FA_CSS` dipindah ke fa-icons.ts saat Task 7 (DRY) — penamaan `LANDING_FONT_CSS` disebut sekali sebagai target ekspor; gunakan nama itu di kedua transform. ✓
