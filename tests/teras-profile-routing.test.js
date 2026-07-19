import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('main.tsx memilah cabang /teras lewat parseTerasPath', () => {
  const main = read('src/main.tsx');
  assert.match(main, /import \{ parseTerasPath \} from '\.\/lib\/terasRoutes'/);
  assert.match(main, /parseTerasPath\(window\.location\.pathname\)/);
  // Share link lama tetap redirect ke post detail.
  assert.match(main, /\/dashboard\/teras\/post\/\$\{encodeURIComponent\(terasShareCode\)\}/);
  // Profil dirender oleh DashboardRouter, bukan halaman terpisah.
  assert.match(main, /if \(isDashboard \|\| isTerasProfile\) return <DashboardRouter \/>/);
});

test('LoginRouter menerima tujuan profil Teras, bukan string sembarang', () => {
  const main = read('src/main.tsx');
  assert.match(main, /parseTerasPath\(stored\)\?\.kind === 'profile'/);
  assert.match(main, /stored\.startsWith\('\/dashboard\/teras\/post\/'\)/);
});

test('DashboardLayout memetakan /teras/<slug> ke tab teras dengan profileSlug', () => {
  const layout = read('src/components/DashboardLayout.tsx');
  assert.match(layout, /function getTerasProfileSlugFromPath\(\): string \| null/);
  assert.match(layout, /profileSlug=\{terasProfileSlug\}/);
  // Tab aktif untuk /teras/<slug> adalah 'teras'.
  assert.match(layout, /if \(parseTerasPath\(window\.location\.pathname\)\?\.kind === 'profile'\) return 'teras';/);
});

test('tombol back dari profil kembali ke feed Teras', () => {
  const layout = read('src/components/DashboardLayout.tsx');
  // Harus gagal kalau `terasProfileSlug` dicabut dari kondisi ini — sebelum Task 4
  // baris ini sudah ada untuk terasPostId (back dari post detail) saja.
  assert.match(
    layout,
    /if \(terasPostId \|\| terasProfileSlug\) \{\s*\n\s*if \(window\.history\.state\?\.terasFromFeed\) window\.history\.back\(\);\s*\n\s*else navigatePath\('\/dashboard\/teras'/,
  );
});
