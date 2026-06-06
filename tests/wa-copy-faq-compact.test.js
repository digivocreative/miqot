import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const source = readFileSync(
  join(rootPath, 'src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx'),
  'utf8',
);

test('WA Copy FAQ item uses a compact operational card layout', () => {
  assert.match(source, /rounded-2xl border border-gray-100 bg-white shadow-sm/);
  assert.match(source, /text-\[13px\] font-semibold leading-snug/);
  assert.doesNotMatch(source, /shadow-\[0_1px_2px_rgba/);
});

test('WA Copy FAQ item does not render a category badge inside the accordion card', () => {
  assert.doesNotMatch(source, /FAQ_CATEGORIES/);
  assert.doesNotMatch(source, /CATEGORY_LABEL/);
  assert.doesNotMatch(source, /entry\.category/);
});

test('WA Copy FAQ answer and actions are visually tighter', () => {
  assert.match(source, /text-\[13px\] leading-relaxed/);
  assert.match(source, /h-10[\s\S]*\{copied \? 'Tersalin' : 'Salin'\}/);
  assert.doesNotMatch(source, /py-2\.5 rounded-xl/);
});
