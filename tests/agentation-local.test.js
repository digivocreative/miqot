import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('renders Agentation only in local development', () => {
  assert.match(main, /import\('agentation'\)/);
  assert.match(main, /import\.meta\.env\.DEV/);
  assert.match(main, /<LocalAgentation \/>/);
});
