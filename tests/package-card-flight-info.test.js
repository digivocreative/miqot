import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/PackageCard.tsx', import.meta.url), 'utf8');

test('package card shows dates before flight numbers with swapped visual hierarchy', () => {
  const departure = source.slice(
    source.indexOf('{/* Departure */}'),
    source.indexOf('{/* Return */}'),
  );
  const returnFlight = source.slice(
    source.indexOf('{/* Return */}'),
    source.indexOf('{/* Hotel Information'),
  );

  for (const block of [departure, returnFlight]) {
    const dateIndex = block.indexOf('formatDate(');
    const flightNumberIndex = block.indexOf('kodePenerbangan');
    assert.ok(dateIndex > -1 && flightNumberIndex > -1 && dateIndex < flightNumberIndex);
    assert.match(block, /text-xs font-medium text-gray-700 dark:text-slate-200/);
    assert.match(block, /text-\[10px\] text-gray-500 dark:text-slate-400/);
  }
});
