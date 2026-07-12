import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const filterDropdown = readFileSync(join(root.pathname, 'src/components/FilterDropdown.tsx'), 'utf8');
const filterHeader = readFileSync(join(root.pathname, 'src/components/FilterHeader.tsx'), 'utf8');

test('FilterDropdown supports rendering all options without a scroll cap', () => {
  assert.match(filterDropdown, /showAllOptions\?: boolean/);
  assert.match(filterDropdown, /showAllOptions = false/);
  assert.match(filterDropdown, /const showSearch = searchable && !showAllOptions && options\.length >= 8/);
  assert.match(filterDropdown, /showAllOptions\s+\?\s+'overflow-visible'/);
  assert.match(filterDropdown, /:\s+'max-h-60 overflow-y-auto overscroll-contain touch-pan-y \[-webkit-overflow-scrolling:touch\]'/);
});

test('landing header disables the scroll cap only for the main filter dropdown', () => {
  const mainFilterBlock = filterHeader.match(/\{\/\* Main Filter Dropdown \*\/\}[\s\S]*?\/>/)?.[0] ?? '';
  assert.match(mainFilterBlock, /showAllOptions/);

  const otherDropdownBlocks = [...filterHeader.matchAll(/<FilterDropdown[\s\S]*?\/>/g)]
    .map((match) => match[0])
    .filter((block) => !block.includes('ariaLabel="Filter paket"'));

  assert.ok(otherDropdownBlocks.length > 0);
  assert.ok(otherDropdownBlocks.every((block) => !block.includes('showAllOptions')));
});

test('landing header does not offer the school holiday filter', () => {
  const optionsBlock = filterHeader.match(/const FILTER_MODE_OPTIONS[\s\S]*?\n\];/)?.[0] ?? '';

  assert.doesNotMatch(optionsBlock, /LIBURAN_SEKOLAH|LIBURAN SEKOLAH/);
});
