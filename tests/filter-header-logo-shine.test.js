import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const headerSource = readFileSync(new URL('../src/components/FilterHeader.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('FilterHeader logo has a shape-clipped shine layer', () => {
  assert.match(headerSource, /className="group relative block cursor-pointer/);
  assert.match(headerSource, /aria-hidden="true"[\s\S]*animate-logo-shine/);
  assert.match(cssSource, /\.animate-logo-shine\s*\{[\s\S]*mask-image:[\s\S]*animation: logo-shine-sweep/);
  assert.match(cssSource, /linear-gradient\(125deg/);
  assert.match(cssSource, /transparent 41%, #000 49%, #000 52%, transparent 60%/);
  assert.match(cssSource, /animation: logo-shine-sweep 3\.4s/);
  assert.match(cssSource, /@keyframes logo-shine-sweep/);
});

test('logo shine is disabled when reduced motion is requested', () => {
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.animate-logo-shine[\s\S]*animation: none/);
});
