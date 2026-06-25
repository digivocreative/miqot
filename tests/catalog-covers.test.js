import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CATALOG_COVERS,
  DEFAULT_COVER_ID,
  getCatalogCover,
} from '../src/lib/catalogCovers.js';

const root = new URL('..', import.meta.url).pathname;

test('registry has 7 covers with unique non-empty ids/labels/images', () => {
  assert.equal(CATALOG_COVERS.length, 7);
  const ids = CATALOG_COVERS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  for (const c of CATALOG_COVERS) {
    assert.ok(c.id && typeof c.id === 'string', 'id non-empty');
    assert.ok(c.label && typeof c.label === 'string', 'label non-empty');
    assert.ok(c.image && c.image.startsWith('/img-brosur/'), 'image path under /img-brosur/');
  }
});

test('classic is the default and first entry', () => {
  assert.equal(DEFAULT_COVER_ID, 'classic');
  assert.equal(CATALOG_COVERS[0].id, 'classic');
  assert.ok(CATALOG_COVERS.some((c) => c.id === DEFAULT_COVER_ID));
});

test('getCatalogCover falls back to default for unknown/null/undefined', () => {
  assert.equal(getCatalogCover('ngawur').id, DEFAULT_COVER_ID);
  assert.equal(getCatalogCover(null).id, DEFAULT_COVER_ID);
  assert.equal(getCatalogCover(undefined).id, DEFAULT_COVER_ID);
});

test('getCatalogCover returns the matching cover for a known id', () => {
  assert.equal(getCatalogCover('sunset').id, 'sunset');
});

test('every cover image file exists in public/', () => {
  for (const c of CATALOG_COVERS) {
    const p = join(root, 'public', c.image);
    assert.ok(existsSync(p), `missing asset: ${c.image}`);
  }
});
