import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/PackageCard.tsx', import.meta.url), 'utf8');

test('journey timeline switches to a compact layout after three steps', () => {
  assert.match(source, /const isCompactJourney = journeySteps\.length > 3/);
  assert.match(source, /data-journey-layout=\{isCompactJourney \? 'compact' : 'standard'\}/);
});

test('compact journey uses flexible tracks and wrapping labels without changing the standard layout', () => {
  assert.match(source, /isCompactJourney \? 'minmax\(0,1fr\)' : 'minmax\(max-content,1fr\)'/);
  assert.match(source, /'minmax\(14px,0\.45fr\)'/);
  assert.match(source, /'w-full whitespace-normal px-0\.5 text-\[10px\]'/);
  assert.match(source, /'whitespace-nowrap px-1 text-\[11px\]'/);
});
