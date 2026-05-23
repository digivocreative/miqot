import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const jamaahPage = readFileSync(join(root.pathname, 'src/components/JamaahPage.tsx'), 'utf8');
const hajiPage = readFileSync(join(root.pathname, 'src/components/HajiPage.tsx'), 'utf8');

test('umroh empty search or filter results do not trigger first-load auto sync', () => {
  assert.match(jamaahPage, /const hasActiveUmrohListQuery = /);
  assert.match(
    jamaahPage,
    /!hasActiveUmrohListQuery[\s\S]*data && data\.counts\.semua === 0 && data\.total === 0 && data\.items\.length === 0/
  );
  assert.match(jamaahPage, /\[view, loadingData, syncing, data, hasActiveUmrohListQuery/);
});

test('haji empty search or filter results do not trigger first-load auto sync', () => {
  assert.match(hajiPage, /const hasActiveHajiListQuery = /);
  assert.match(
    hajiPage,
    /!hasActiveHajiListQuery[\s\S]*stats && stats\.total === 0 && total === 0 && jamaahList\.length === 0/
  );
  assert.match(hajiPage, /\[view, loading, syncing, stats\?\.total, total, jamaahList\.length, hasActiveHajiListQuery/);
});
