import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimatch } from 'minimatch';
import { PRECACHE_GLOB_PATTERNS, PRECACHE_GLOB_IGNORES } from '../src/lib/pwa/buildConfig.js';

test('city photos for the weather banner stay out of the service-worker precache', () => {
  const files = readdirSync(new URL('../public/cuaca-share/', import.meta.url)).map(f => `cuaca-share/${f}`);
  assert.ok(files.length >= 5);
  for (const file of files) {
    const precached = PRECACHE_GLOB_PATTERNS.some(p => minimatch(file, p))
      && !PRECACHE_GLOB_IGNORES.some(p => minimatch(file, p));
    assert.equal(precached, false, file);
  }
});
