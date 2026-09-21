import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(rootPath, path), 'utf8');

// Skrip inline prefetch /api/schedules di index.html berjalan sebelum bundle, jadi
// konstantanya diduplikasi dari data-service.ts. Kalau salah satu berubah tanpa yang lain,
// prefetch mengambil tahun yang salah (dibuang → dua request) atau salah menilai
// kesegaran cache localStorage.
test('YEAR prefetch di index.html sama dengan DEFAULT_YEAR_CODE data-service', () => {
  const html = read('index.html');
  const dataService = read('src/services/data-service.ts');

  const prefetch = html.match(/Prefetch awal \/api\/schedules[\s\S]*?<\/script>/)?.[0] ?? '';
  assert.notEqual(prefetch, '', 'skrip prefetch tidak ditemukan di index.html');

  const year = prefetch.match(/var YEAR = '(\d{4})'/)?.[1];
  const defaultYear = dataService.match(/const DEFAULT_YEAR_CODE = '(\d{4})'/)?.[1];
  assert.ok(year, 'var YEAR tidak ditemukan di skrip prefetch');
  assert.ok(defaultYear, 'DEFAULT_YEAR_CODE tidak ditemukan di data-service.ts');
  assert.equal(year, defaultYear);

  // Kunci & TTL cache localStorage harus sama persis dengan data-service.
  const prefix = dataService.match(/const PACKAGES_CACHE_PREFIX = '([^']+)'/)?.[1];
  assert.ok(prefix, 'PACKAGES_CACHE_PREFIX tidak ditemukan');
  assert.match(prefetch, new RegExp(`localStorage\\.getItem\\('${prefix}' \\+ YEAR\\)`));
  const ttl = dataService.match(/const PACKAGES_CACHE_TTL_MS = ([^;]+);/)?.[1]?.trim();
  assert.ok(ttl, 'PACKAGES_CACHE_TTL_MS tidak ditemukan');
  assert.ok(prefetch.includes(`< ${ttl}`), `TTL prefetch harus "${ttl}"`);

  // URL & bentuk map yang dibaca fetchFromApi.
  assert.match(prefetch, /fetch\('\/api\/schedules\/' \+ YEAR/);
  assert.match(prefetch, /window\.__schedulesPrefetch\[YEAR\] = req/);
  assert.match(prefetch, /req\.catch\(function \(\) \{\}\)/);

  // Stempel mulai per tahun: data-service membuang prefetch yang berumur > batas
  // (SCHEDULES_PREFETCH_MAX_AGE_MS) — tanpa stempel entrinya tidak dipercaya sama sekali.
  assert.match(prefetch, /window\.__schedulesPrefetchAt\[YEAR\] = Date\.now\(\)/);
  assert.match(dataService, /window\.__schedulesPrefetchAt/);
  assert.match(dataService, /const SCHEDULES_PREFETCH_MAX_AGE_MS = /);

  // Agent yang sudah login membuka "/" host PWA: dashboard dirender in-place (App tidak
  // mount), jadi prefetch dilewati — bukan menggantung lalu dibuang.
  assert.match(prefetch, /localStorage\.getItem\('auth_session'\) \|\| sessionStorage\.getItem\('auth_session'\)/);
});

test('skrip prefetch berada setelah bypass SW dan sebelum entry module', () => {
  const html = read('index.html');
  const bypassAt = html.indexOf('Bypass service worker');
  const prefetchAt = html.indexOf('Prefetch awal /api/schedules');
  const entryAt = html.indexOf('<script type="module" src="/src/main.tsx">');
  assert.ok(bypassAt > -1 && prefetchAt > -1 && entryAt > -1);
  assert.ok(bypassAt < prefetchAt && prefetchAt < entryAt, 'urutan skrip: bypass → prefetch → main.tsx');
});

// Subset font: preload hanya -latin 400/600/700/800, dan tiap berat Inter punya urutan
// @font-face penuh (BMP) → latin-ext → latin (aturan terakhir menang untuk Latin).
test('index.html memakai subset Inter latin dengan urutan @font-face yang benar', () => {
  const html = read('index.html');
  const preloads = [...html.matchAll(/<link rel="preload" as="font"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(preloads, [
    '/fonts/brochure/Inter-Regular-latin.woff2',
    '/fonts/brochure/Inter-SemiBold-latin.woff2',
    '/fonts/brochure/Inter-Bold-latin.woff2',
    '/fonts/brochure/Inter-ExtraBold-latin.woff2',
  ]);

  const faces = [...html.matchAll(/@font-face \{ font-family: 'Inter'; [^}]*font-weight: (\d+); [^}]*url\('([^']+)'\)[^}]*?(unicode-range: [^;]+;)? \}/g)]
    .map((m) => ({ decl: m[0], weight: m[1], file: m[2].replace('/fonts/brochure/', ''), range: m[3] ?? null }));
  for (const face of faces) {
    // Deklarasi src harus tertutup ';' sebelum unicode-range — tanpa itu seluruh src
    // tidak valid dan face-nya diabaikan peramban (diam-diam jatuh ke font sistem).
    assert.match(face.decl, /format\('woff2'\); (?:unicode-range: [^;]+; )?\}$/, `deklarasi @font-face ${face.file}`);
  }
  const byWeight = new Map();
  for (const face of faces) {
    if (!byWeight.has(face.weight)) byWeight.set(face.weight, []);
    byWeight.get(face.weight).push(face);
  }
  const expected = { 400: 'Regular', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
  for (const [weight, name] of Object.entries(expected)) {
    const list = byWeight.get(weight) ?? [];
    assert.deepEqual(list.map((f) => f.file), [
      `Inter-${name}.woff2`,
      `Inter-${name}-latin-ext.woff2`,
      `Inter-${name}-latin.woff2`,
    ], `urutan @font-face Inter ${weight}`);
    // Berkas penuh dibatasi BMP: emoji (🕌 🕋 bendera, di luar BMP) tidak boleh memicu unduhan
    // 108 KB hanya untuk menemukan Inter tak punya glyph-nya.
    assert.equal(list[0].range, 'unicode-range: U+0000-FFFF;', `berkas penuh Inter ${weight} dibatasi BMP`);
    assert.match(list[1].range ?? '', /^unicode-range: U\+0100-02BA, /, `latin-ext Inter ${weight}`);
    assert.match(list[2].range ?? '', /^unicode-range: U\+0000-00FF, /, `latin Inter ${weight}`);
    // ★ rating hotel (PackageCard) harus dilayani subset latin, bukan berkas penuh.
    assert.ok(list[2].range.includes('U+2605-2606'), `subset latin Inter ${weight} memuat ★☆`);
  }
});
