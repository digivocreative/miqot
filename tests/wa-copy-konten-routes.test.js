import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKontenPath, kontenPath, kontenParentPath, kontenTitle } from '../src/components/wa-copy/lib/kontenRoutes.js';

const ROUTES = [
  { route: { kind: 'list', tab: 'faq' }, path: '/dashboard/konten/faq' },
  { route: { kind: 'list', tab: 'caption' }, path: '/dashboard/konten/caption' },
  { route: { kind: 'entry-new', tab: 'tourleader' }, path: '/dashboard/konten/tourleader/tambah' },
  { route: { kind: 'entry-edit', tab: 'faq', id: 'faq-umum-pertama' }, path: '/dashboard/konten/faq/edit/faq-umum-pertama' },
  { route: { kind: 'cat-list', tab: 'caption' }, path: '/dashboard/konten/caption/kategori' },
  { route: { kind: 'cat-new', tab: 'faq' }, path: '/dashboard/konten/faq/kategori/tambah' },
  { route: { kind: 'cat-edit', tab: 'faq', value: 'umum' }, path: '/dashboard/konten/faq/kategori/edit/umum' },
  { route: { kind: 'cat-delete', tab: 'tourleader', value: 'persiapan' }, path: '/dashboard/konten/tourleader/kategori/hapus/persiapan' },
];

test('kontenPath builds canonical paths and parseKontenPath round-trips them', () => {
  for (const { route, path } of ROUTES) {
    assert.equal(kontenPath(route), path);
    const parsed = parseKontenPath(path);
    assert.deepEqual(parsed.route, route);
    assert.equal(parsed.canonical, true, `${path} should be canonical`);
  }
});

test('ids and category values survive URL encoding round-trips', () => {
  for (const raw of ['has space', 'a/b', 'ünïcode', '50%off', 'q?x=1&y=2']) {
    for (const route of [
      { kind: 'entry-edit', tab: 'faq', id: raw },
      { kind: 'cat-edit', tab: 'caption', value: raw },
      { kind: 'cat-delete', tab: 'faq', value: raw },
    ]) {
      const parsed = parseKontenPath(kontenPath(route));
      assert.deepEqual(parsed.route, route);
      assert.equal(parsed.canonical, true);
    }
  }
});

test('non-canonical and malformed paths fall back safely', () => {
  // bare base → default tab, flagged non-canonical so the page replace-navigates
  assert.deepEqual(parseKontenPath('/dashboard/konten'),
    { route: { kind: 'list', tab: 'faq' }, canonical: false });
  // unknown tab → global fallback
  assert.deepEqual(parseKontenPath('/dashboard/konten/xyz/tambah'),
    { route: { kind: 'list', tab: 'faq' }, canonical: false });
  // malformed sub-paths degrade to that tab's list
  for (const [p, tab] of [
    ['/dashboard/konten/faq/edit', 'faq'],             // missing id
    ['/dashboard/konten/faq/tambah/extra', 'faq'],
    ['/dashboard/konten/caption/unknown', 'caption'],
    ['/dashboard/konten/faq/kategori/hapus', 'faq'],   // missing value
    ['/dashboard/konten/faq/kategori/edit/x/y', 'faq'],
  ]) {
    const parsed = parseKontenPath(p);
    assert.deepEqual(parsed.route, { kind: 'list', tab }, p);
    assert.equal(parsed.canonical, false, p);
  }
  // not a konten path at all
  assert.deepEqual(parseKontenPath('/dashboard/jamaah'),
    { route: { kind: 'list', tab: 'faq' }, canonical: false });
  // malformed percent-encoding must not throw
  assert.equal(parseKontenPath('/dashboard/konten/faq/edit/%E0%A4%A').canonical, false);
});

test('kontenTitle gives sub-views a contextual header title, list keeps the default', () => {
  // null → DashboardLayout keeps the "Konten" tab label
  assert.equal(kontenTitle({ kind: 'list', tab: 'faq' }), null);
  assert.equal(kontenTitle({ kind: 'list', tab: 'tourleader' }), null);
  // entry editors name the content type
  assert.equal(kontenTitle({ kind: 'entry-new', tab: 'caption' }), 'Tambah Caption');
  assert.equal(kontenTitle({ kind: 'entry-edit', tab: 'faq', id: 'x' }), 'Edit FAQ');
  assert.equal(kontenTitle({ kind: 'entry-new', tab: 'tourleader' }), 'Tambah Tour Leader');
  // category manager mirrors the old in-content titles
  assert.equal(kontenTitle({ kind: 'cat-list', tab: 'caption' }), 'Kategori Caption');
  assert.equal(kontenTitle({ kind: 'cat-list', tab: 'faq' }), 'Kategori FAQ');
  assert.equal(kontenTitle({ kind: 'cat-list', tab: 'tourleader' }), 'Fase Tour Leader');
  // tourleader categories are "Fase", the rest "Kategori"
  assert.equal(kontenTitle({ kind: 'cat-new', tab: 'faq' }), 'Tambah Kategori');
  assert.equal(kontenTitle({ kind: 'cat-edit', tab: 'caption', value: 'v' }), 'Edit Kategori');
  assert.equal(kontenTitle({ kind: 'cat-delete', tab: 'tourleader', value: 'v' }), 'Hapus Fase');
});

test('kontenParentPath walks editor→list, kategori-sub→kategori, kategori→list, list→null', () => {
  assert.equal(kontenParentPath({ kind: 'list', tab: 'faq' }), null);
  assert.equal(kontenParentPath({ kind: 'entry-new', tab: 'faq' }), '/dashboard/konten/faq');
  assert.equal(kontenParentPath({ kind: 'entry-edit', tab: 'caption', id: 'x' }), '/dashboard/konten/caption');
  assert.equal(kontenParentPath({ kind: 'cat-list', tab: 'faq' }), '/dashboard/konten/faq');
  assert.equal(kontenParentPath({ kind: 'cat-new', tab: 'faq' }), '/dashboard/konten/faq/kategori');
  assert.equal(kontenParentPath({ kind: 'cat-edit', tab: 'faq', value: 'v' }), '/dashboard/konten/faq/kategori');
  assert.equal(kontenParentPath({ kind: 'cat-delete', tab: 'faq', value: 'v' }), '/dashboard/konten/faq/kategori');
});
