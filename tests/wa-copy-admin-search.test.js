import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(rootPath, p), 'utf8');

test('ContentList owns the konten search box and filters every row text field', () => {
  const list = read('src/components/wa-copy/admin/ContentList.tsx');
  // Search state lives HERE — WaCopyAdminPage must stay view-state-free
  // (enforced by wa-copy-category-manager.test.js's no-useState assertion).
  assert.match(list, /useState\(''\)/);
  assert.match(list, /placeholder="Cari konten…"/);
  // Matches category badge + visible title/subtitle + the full hidden text.
  assert.match(list, /r\.badge.*r\.title.*r\.subtitle.*r\.searchText/);
  // Reordering swaps with possibly-hidden neighbors — arrows disabled while filtering.
  assert.match(list, /!row\.canUp \|\| filtering/);
  assert.match(list, /!row\.canDown \|\| filtering/);
  // Distinct empty states: no content at all vs no search hits.
  assert.match(list, /Belum ada konten\./);
  assert.match(list, /Tidak ada hasil/);
});

test('admin rows expose full searchable text per tab, not the truncated title', () => {
  const page = read('src/components/wa-copy/admin/WaCopyAdminPage.tsx');
  assert.match(page, /searchText: c\.template/);
  assert.match(page, /searchText: `\$\{f\.question\}\\n\$\{f\.answer\}`/);
  assert.match(page, /searchText: `\$\{t\.title\}\\n\$\{t\.body\}`/);
  // Remount per tab so the query resets when switching FAQ/Caption/Tour Leader.
  assert.match(page, /<ContentList key=\{type\}/);
});
