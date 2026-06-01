import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugifyCategory,
  uniqueCategoryValue,
  appendCategory,
  patchCategory,
  reorderCategory,
  deleteCategoryAndReassign,
} from '../src/components/wa-copy/lib/categoryOps.js';

const cats = () => [
  { value: 'a', label: 'A', iconName: 'Heart', tip: '', order: 1 },
  { value: 'b', label: 'B', iconName: 'Wallet', tip: '', order: 2 },
  { value: 'c', label: 'C', iconName: 'Tag', tip: '', order: 3 },
];

test('slugifyCategory normalizes labels and falls back to "kategori"', () => {
  assert.equal(slugifyCategory('Ringan di Kantong'), 'ringan-di-kantong');
  assert.equal(slugifyCategory('Tips & Info!'), 'tips-info');
  assert.equal(slugifyCategory('   '), 'kategori');
});

test('uniqueCategoryValue de-duplicates with numeric suffixes', () => {
  const taken = new Set(['promo', 'promo-2']);
  assert.equal(uniqueCategoryValue('baru', taken), 'baru');
  assert.equal(uniqueCategoryValue('promo', taken), 'promo-3');
});

test('appendCategory adds a slugged, ordered, trimmed record', () => {
  const next = appendCategory(cats(), { label: '  Promo Akhir Tahun ', iconName: 'Gift', tip: '  hemat  ' });
  assert.equal(next.length, 4);
  const added = next[3];
  assert.equal(added.value, 'promo-akhir-tahun');
  assert.equal(added.label, 'Promo Akhir Tahun');
  assert.equal(added.tip, 'hemat');
  assert.equal(added.order, 4);
});

test('appendCategory keeps the value unique against existing ids', () => {
  const list = [{ value: 'promo', label: 'Promo', iconName: 'Gift', tip: '', order: 1 }];
  const next = appendCategory(list, { label: 'Promo', iconName: 'Gift', tip: '' });
  assert.equal(next[1].value, 'promo-2');
});

test('patchCategory updates display fields but keeps value stable', () => {
  const next = patchCategory(cats(), 'b', { label: ' Beta ', iconName: 'Star' });
  const b = next.find(c => c.value === 'b');
  assert.equal(b.value, 'b');
  assert.equal(b.label, 'Beta');
  assert.equal(b.iconName, 'Star');
  assert.equal(b.order, 2);
});

test('reorderCategory swaps order with the neighbour and is a no-op at bounds', () => {
  const up = reorderCategory(cats(), 'b', 'up');
  assert.equal(up.find(c => c.value === 'b').order, 1);
  assert.equal(up.find(c => c.value === 'a').order, 2);
  const noop = reorderCategory(cats(), 'a', 'up');
  assert.deepEqual(noop, cats());
});

test('deleteCategoryAndReassign moves items to the target with appended order, no orphans', () => {
  const items = [
    { id: 'i1', category: 'a', order: 1 },
    { id: 'i2', category: 'a', order: 2 },
    { id: 'i3', category: 'b', order: 1 },
  ];
  const res = deleteCategoryAndReassign(cats(), items, 'category', 'a', 'b');
  assert.ok(res);
  assert.equal(res.categories.length, 2);
  assert.ok(!res.categories.some(c => c.value === 'a'));
  assert.ok(!res.items.some(it => it.category === 'a')); // no orphans
  const inB = res.items.filter(it => it.category === 'b').map(it => it.order).sort();
  assert.deepEqual(inB, [1, 2, 3]); // i3 stays 1, i1/i2 appended 2,3
});

test('deleteCategoryAndReassign rejects invalid deletions (null result)', () => {
  const one = [{ value: 'only', label: 'Only', iconName: 'Tag', tip: '', order: 1 }];
  assert.equal(deleteCategoryAndReassign(one, [], 'category', 'only', 'only'), null); // last category
  assert.equal(deleteCategoryAndReassign(cats(), [], 'category', 'a', 'a'), null);      // same target
  assert.equal(deleteCategoryAndReassign(cats(), [], 'category', 'a', 'zzz'), null);    // missing target
});
