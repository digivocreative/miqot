import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/PackageCard.tsx', import.meta.url), 'utf8');

// Brosur ±300KB/gambar. Preview di kartu list hanya boleh ter-mount setelah
// kartu pernah dibuka — kalau gate ini hilang, SEMUA kartu di list langsung
// mengunduh brosurnya masing-masing saat halaman dimuat.
test('brosur preview mounts lazily: single view langsung, kartu list setelah pernah dibuka', () => {
  assert.match(source, /useState\(isSingleView\);?\s*$/m, 'showBrosurPreview diinit dari isSingleView');
  assert.match(source, /if \(isExpanded\) setShowBrosurPreview\(true\);/);
  assert.match(source, /\{showBrosurPreview && !brosurError && pkg\.brosurUrl &&/);
});

test('skeleton 3:4 menahan tinggi sampai gambar siap, lalu fade-in', () => {
  assert.match(source, /brosurLoaded \? undefined : 'aspect-\[3\/4\] [^']*animate-pulse'/);
  assert.match(source, /\$\{brosurLoaded \? 'opacity-100' : 'opacity-0'\}/);
  assert.match(source, /onLoad=\{\(\) => setBrosurLoaded\(true\)\}/);
  // Gambar dari cache bisa complete sebelum onLoad terpasang.
  assert.match(source, /el\?\.complete && el\.naturalWidth > 0/);
});

test('brosur yang belum termuat tidak ikut ke-export screenshot kartu', () => {
  assert.match(source, /\.\.\.\(brosurLoaded \? \{\} : \{ 'data-screenshot-ignore': true \}\)/);
});
