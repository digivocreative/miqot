import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Judul tab halaman Jadwal publik. Server sudah menulis meta yang benar untuk
// muat pertama (SPA fallback di server.js); yang dijaga di sini apa yang SSR
// TIDAK bisa jangkau — pengguna berpindah filter tanpa reload.

const root = new URL('..', import.meta.url).pathname;
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');

test('judul tab dibangun dari modul share-meta yang sama dengan SSR', () => {
  // Kalau klien menyusun judulnya sendiri, judul tab dan kartu WhatsApp bisa
  // menyebut filter yang sama dengan dua nama berbeda.
  assert.match(app, /import \{ buildFilterShareMeta \} from '\.\.\/lib\/filter-share-meta\.js'/);
});

test('efek judul ikut filterMode & filterSecondaryValue', () => {
  // Tanpa dua dep ini judul hanya benar saat muat pertama, lalu basi begitu
  // pengguna berpindah filter.
  const effect = app.match(/\/\/ Dynamic SEO[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.notEqual(effect, '', 'efek judul tidak ditemukan');
  assert.match(effect, /buildFilterShareMeta/);
  assert.match(effect, /filterMode/);
  assert.match(effect, /filterSecondaryValue/);
});

test('paket tunggal tetap menang atas judul filter', () => {
  // Efek meta paket tunggal lebih spesifik. Tanpa gerbang ini keduanya berebut
  // document.title dan judulnya berkedip bolak-balik.
  const effect = app.match(/\/\/ Dynamic SEO[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.match(effect, /if \(singlePackageId\) return;/, 'gerbang singlePackageId hilang');
});

test('blok judul lama tidak tertinggal di efek pembaca URL', () => {
  // Dulu judulnya disetel di dalam efek yang membaca URL — jalan SEKALI saat
  // mount. Kalau salinan itu tertinggal, ia menimpa judul filter dari SSR
  // sedetik setelah halaman tampil.
  const urlEffect = app.match(/const parsedUrl = parseFilterSearch[\s\S]*?urlSyncReadyRef\.current = true;/)?.[0] ?? '';
  assert.notEqual(urlEffect, '', 'efek pembaca URL tidak ditemukan');
  assert.doesNotMatch(urlEffect, /document\.title/, 'judul masih disetel di efek pembaca URL');
});
