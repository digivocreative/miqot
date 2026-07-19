import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The Teras loading skeleton exists in two copies: the one DashboardLayout
 * renders before TerasPage is even loaded, and PostSkeleton inside TerasPage.
 * They must stay in sync, and each placeholder must resemble what actually
 * paints at rest — a solid 44px circle in the post's top-right corner reads as
 * a second agent photo, when the real element there is a transparent "…" menu
 * button that has no background until hover/open.
 */

const layoutSource = readFileSync(
  new URL('../src/components/DashboardLayout.tsx', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../src/components/TerasPage.tsx', import.meta.url),
  'utf8',
);

const MENU_PLACEHOLDER = /absolute right-2 top-0 flex h-11 w-11 items-center justify-center/;
const FILLED_MENU_CIRCLE = /absolute right-2 top-0 h-11 w-11 rounded-full bg-/;

test('skeleton kiriman tidak menggambar lingkaran penuh di pojok kanan atas', () => {
  for (const [name, source] of [['DashboardLayout', layoutSource], ['TerasPage', pageSource]]) {
    assert.doesNotMatch(
      source,
      FILLED_MENU_CIRCLE,
      `${name}: lingkaran penuh 44px di pojok kanan terbaca sebagai foto agent kedua`,
    );
  }
});

test('placeholder menu tetap memakai kotak 44px agar tata letak tidak bergeser', () => {
  for (const [name, source] of [['DashboardLayout', layoutSource], ['TerasPage', pageSource]]) {
    assert.match(source, MENU_PLACEHOLDER, `${name}: footprint 44px placeholder menu hilang`);
  }
});

test('kedua salinan skeleton memakai markup placeholder menu yang sama', () => {
  const extract = source => {
    const match = source.match(/absolute right-2 top-0 flex h-11 w-11[^"]*/);
    return match ? match[0] : null;
  };
  const layoutPlaceholder = extract(layoutSource);
  const pagePlaceholder = extract(pageSource);
  assert.ok(layoutPlaceholder, 'DashboardLayout harus punya placeholder menu');
  assert.equal(pagePlaceholder, layoutPlaceholder);
});
