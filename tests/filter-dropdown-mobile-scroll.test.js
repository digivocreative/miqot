import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const filterDropdown = readFileSync(join(root.pathname, 'src/components/FilterDropdown.tsx'), 'utf8');

test('filter dropdown option list contains mobile touch scrolling inside the dropdown', () => {
  assert.match(filterDropdown, /data-filter-dropdown-scroll/);
  assert.match(filterDropdown, /overscroll-contain/);
  assert.match(filterDropdown, /touch-pan-y/);
  assert.match(filterDropdown, /\[-webkit-overflow-scrolling:touch\]/);
  assert.match(filterDropdown, /addEventListener\('touchstart', handleScrollableTouchStart, \{ passive: true \}\)/);
  assert.match(filterDropdown, /addEventListener\('touchmove', handleScrollableTouchMove, \{ passive: false \}\)/);
  assert.match(filterDropdown, /e\.preventDefault\(\)/);
});
