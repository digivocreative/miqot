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

test('registry has 9 covers with unique non-empty ids/labels/images', () => {
  assert.equal(CATALOG_COVERS.length, 9);
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

test('classic cover carries no overrides (uses component defaults → zero regression)', () => {
  const classic = getCatalogCover('classic');
  for (const k of ['scrim', 'kickerColor', 'titleColor', 'rangeColor', 'ribbonGradient', 'headline']) {
    assert.equal(classic[k], undefined, `classic must not override ${k}`);
  }
});

test('every non-classic cover defines scrim + headline colors for legibility', () => {
  for (const c of CATALOG_COVERS.filter((c) => c.id !== 'classic')) {
    for (const k of ['scrim', 'kickerColor', 'titleColor', 'rangeColor']) {
      assert.ok(c[k] && typeof c[k] === 'string', `${c.id} missing ${k}`);
    }
  }
});

test('subject-on-side covers shift the headline left (composition)', () => {
  for (const id of ['ihram-1', 'ihram-2', 'menara']) {
    assert.equal(getCatalogCover(id).headline?.align, 'left', `${id} headline should be left-aligned`);
  }
});

test('BrochureSchedulePage wires the cover picker + persistence', () => {
  const src = readFileSync(join(root, 'src/components/BrochureSchedulePage.tsx'), 'utf8');
  assert.match(src, /'catalogCoverId'/, 'uses localStorage key catalogCoverId');
  assert.match(src, /getCatalogCover/, 'imports/uses getCatalogCover');
  assert.match(src, /<CatalogCoverPicker/, 'renders CatalogCoverPicker');
  assert.match(src, /cover=\{getCatalogCover\(coverId\)\}/, 'passes selected cover to BrochureCatalogCover');
});

test('catalog download follows the active brochure filter without a scope switch', () => {
  const src = readFileSync(join(root, 'src/components/BrochureSchedulePage.tsx'), 'utf8');
  assert.match(src, /<span>Unduh Katalog PDF<\/span>/, 'uses the requested catalog label');
  assert.match(src, /pages: activeImagePages/, 'catalog pages come from the active filter');
  assert.doesNotMatch(src, /Filter Ini|all-ready/, 'legacy catalog scope choices are removed');
});
