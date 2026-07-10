import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const filterDropdown = readFileSync(
  new URL('../src/components/FilterDropdown.tsx', import.meta.url),
  'utf8',
);

test('portaled dropdown flips above its trigger when bottom space is insufficient', () => {
  assert.match(filterDropdown, /const panelHeight = panelRef\.current\?\.offsetHeight \|\| 0/);
  assert.match(filterDropdown, /const spaceAbove = r\.top - viewportTop - 8/);
  assert.match(filterDropdown, /const spaceBelow = viewportBottom - r\.bottom - 8/);
  assert.match(filterDropdown, /panelHeight > spaceBelow && spaceAbove > spaceBelow/);
  assert.match(filterDropdown, /r\.top - panelHeight - 4/);
  assert.match(filterDropdown, /data-placement=\{portal && coords\.placeAbove \? 'top' : 'bottom'\}/);
});

test('portaled dropdown follows visual viewport changes from mobile browser UI and keyboard', () => {
  assert.match(filterDropdown, /window\.visualViewport\?\.addEventListener\('scroll', measure\)/);
  assert.match(filterDropdown, /window\.visualViewport\?\.addEventListener\('resize', measure\)/);
  assert.match(filterDropdown, /window\.visualViewport\?\.removeEventListener\('scroll', measure\)/);
  assert.match(filterDropdown, /window\.visualViewport\?\.removeEventListener\('resize', measure\)/);
});
