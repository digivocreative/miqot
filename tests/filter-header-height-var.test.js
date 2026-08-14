import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Penerbitan --filter-header-h (dipakai <main> sebagai padding-top).
//
// AKAR "masih ngejedug di iOS" (2026-08-14, direproduksi di WebKit): iOS Safari
// menembakkan `resize` saat toolbar browser muncul kembali — pada gestur
// scroll-up yang SAMA yang memulai animasi buka header 300ms. publish() jalur
// resize dulu telanjang: ia mengukur DI TENGAH animasi (terukur 153px dari
// settled 167px), menulis nilai antara ke --filter-header-h, menggeser seluruh
// daftar di bawah jari (-14px), lalu transitionend menulis nilai settled dan
// menggesernya balik (+14px). iOS < Safari 27 tanpa scroll anchoring = dua
// sentakan per ganti arah gulir. Jalur transitionend SUDAH disaring settled;
// tes ini menjaga jalur resize ikut berpagar.

const root = new URL('..', import.meta.url).pathname;
const filterHeader = readFileSync(join(root, 'src/components/FilterHeader.tsx'), 'utf8');

test('jalur resize TIDAK boleh memanggil publish telanjang', () => {
  assert.doesNotMatch(filterHeader, /addEventListener\('resize', publish\)/);
});

test('resize hanya mengukur saat animasi buka-tutup header TIDAK berjalan', () => {
  const handler = filterHeader.match(/const onResize = [\s\S]*?\n    \};/)?.[0] ?? '';
  assert.notEqual(handler, '', 'handler onResize tidak ditemukan');
  // Pagarnya bertanya ke animasinya SENDIRI (getAnimations pada dua pembungkus
  // yang menentukan tinggi), bukan timer: resize me-restart transisi — terukur
  // molor sampai ~690ms — jadi timer 300ms+margin pun bocor.
  const gate = filterHeader.match(/const isToggleAnimating = [\s\S]*?\n {6}\);/)?.[0] ?? '';
  assert.notEqual(gate, '', 'helper isToggleAnimating tidak ditemukan');
  assert.match(gate, /collapseRef\.current/);
  assert.match(gate, /padBoxRef\.current/);
  assert.match(gate, /getAnimations\(\)/);
  assert.match(gate, /playState === 'running'/);
  // Kedua jalur di handler memakai pagar itu: pengukuran langsung DAN susulan.
  const gateCalls = [...handler.matchAll(/isToggleAnimating\(\)/g)];
  assert.equal(gateCalls.length, 2, `pagar dipakai ${gateCalls.length}x, harus 2x`);
  assert.match(filterHeader, /addEventListener\('resize', onResize\)/);
  assert.match(filterHeader, /removeEventListener\('resize', onResize\)/);
});

test('resize lintas-breakpoint diukur ULANG setelah reda', () => {
  // Rotasi 390->744 melintasi breakpoint sm: isi header ikut bertransisi
  // (transition-all pada input Cari, ukuran tombol), publish di momen resize
  // mengukur di tengahnya (terukur 175px dari settled 181px), dan transisi itu
  // SENGAJA tidak lolos saringan settled transitionend — tanpa pengukuran
  // susulan nilainya basi selamanya. (Cacat pra-eksisting, terbongkar saat
  // menguji pagar resize.)
  const handler = filterHeader.match(/const onResize = [\s\S]*?\n    \};/)?.[0] ?? '';
  assert.match(handler, /setTimeout/);
  assert.match(handler, /clearTimeout/);
  // Timer susulannya ikut dibersihkan saat unmount.
  assert.match(filterHeader, /clearTimeout\(resizeSettleTimer\)/);
});

test('saringan settled transitionend tetap utuh', () => {
  // Saringan ini pasangan pagar di atas: begitu animasi selesai, JALUR INILAH
  // yang menulis nilai settled — kalau ikut longgar, sentakannya kembali.
  assert.match(filterHeader, /e\.target === collapseRef\.current && e\.propertyName === 'grid-template-rows'/);
  assert.match(filterHeader, /e\.target === padBoxRef\.current && e\.propertyName\.startsWith\('padding'\)/);
});

test('publish saat mount tetap ada — <main> butuh nilai awal', () => {
  assert.match(filterHeader, /publish\(\); \/\/ mount/);
});
