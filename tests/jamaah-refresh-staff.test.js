import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('server preserves legacy staff raw data during AWAPI jamaah refreshes', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /preserveLegacyUmrohRawData/);
  assert.match(server, /preserveLegacyUmrohRawDataForRows/);
  assert.match(server, /rowForUpsert\s*=\s*guardedRefresh\.rows\[0\]/);
});

test('jamaah row refresh merges raw_data instead of replacing legacy staff', () => {
  const page = readFileSync(new URL('../src/components/JamaahPage.tsx', import.meta.url), 'utf8');

  assert.match(page, /function mergeRefreshedJamaahItem/);
  assert.match(page, /\.\.\.\(current\.raw_data \|\| \{\}\),\s*\.\.\.\(fresh\.raw_data \|\| \{\}\)/);
  assert.match(page, /if \(current\.raw_data\?\.staf && mergedRawData && !mergedRawData\.staf\)/);
  assert.match(page, /\.\.\.\(current\.dokumen \|\| \{\}\),\s*\.\.\.\(fresh\.dokumen \|\| \{\}\)/);
  assert.match(page, /dokumen:\s*mergedDokumen/);
});
