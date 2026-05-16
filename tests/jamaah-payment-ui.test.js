import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('admin jamaah payment percentage is clamped for negative sisa values', () => {
  const page = read('src/components/JamaahPage.tsx');

  assert.match(page, /safeSisaForPct/);
  assert.match(page, /Math\.max\(0,\s*Math\.min\(100/);
  assert.doesNotMatch(page, /const total = item\.bayar \+ item\.sisa;\s*const pct = total > 0 \? Math\.round/);
});
