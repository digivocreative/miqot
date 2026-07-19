import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkifySegments, stripUrlFromBody } from '../lib/teras-linkify.js';

test('linkifySegments: text without a URL is a single text segment', () => {
  assert.deepEqual(linkifySegments('halo dunia'), [{ type: 'text', value: 'halo dunia' }]);
});

test('linkifySegments: URL in the middle of a sentence -> text, link, text', () => {
  const segments = linkifySegments('lihat https://x.id/a di sini');
  assert.deepEqual(segments, [
    { type: 'text', value: 'lihat ' },
    { type: 'link', value: 'https://x.id/a', href: 'https://x.id/a' },
    { type: 'text', value: ' di sini' },
  ]);
});

test('linkifySegments: trailing punctuation is excluded from the href', () => {
  assert.deepEqual(linkifySegments('lihat https://x.id/a.'), [
    { type: 'text', value: 'lihat ' },
    { type: 'link', value: 'https://x.id/a', href: 'https://x.id/a' },
    { type: 'text', value: '.' },
  ]);
});

test('linkifySegments: a URL wrapped in parens keeps the parens as text', () => {
  assert.deepEqual(linkifySegments('(https://x.id/a)'), [
    { type: 'text', value: '(' },
    { type: 'link', value: 'https://x.id/a', href: 'https://x.id/a' },
    { type: 'text', value: ')' },
  ]);
});

test('linkifySegments: two URLs in one text -> two link segments', () => {
  const segments = linkifySegments('https://a.id lalu https://b.id');
  assert.deepEqual(segments, [
    { type: 'link', value: 'https://a.id', href: 'https://a.id' },
    { type: 'text', value: ' lalu ' },
    { type: 'link', value: 'https://b.id', href: 'https://b.id' },
  ]);
});

test('linkifySegments: empty string returns an empty array', () => {
  assert.deepEqual(linkifySegments(''), []);
});

test('linkifySegments: a URL ending in /@slug is not swallowed weirdly (whole URL stays href)', () => {
  const segments = linkifySegments('cek https://x.com/@bagas dong');
  assert.deepEqual(segments, [
    { type: 'text', value: 'cek ' },
    { type: 'link', value: 'https://x.com/@bagas', href: 'https://x.com/@bagas' },
    { type: 'text', value: ' dong' },
  ]);
});

test('stripUrlFromBody: URL at the end is trimmed with no dangling space', () => {
  assert.equal(stripUrlFromBody('lihat ini https://x.id/a', 'https://x.id/a'), 'lihat ini');
});

test('stripUrlFromBody: URL in the middle does not leave double spaces', () => {
  assert.equal(stripUrlFromBody('lihat https://x.id/a di sini', 'https://x.id/a'), 'lihat di sini');
});

test('stripUrlFromBody: body that is ONLY the URL becomes empty string', () => {
  assert.equal(stripUrlFromBody('https://x.id/a', 'https://x.id/a'), '');
  assert.equal(stripUrlFromBody('  https://x.id/a  ', 'https://x.id/a'), '');
});

test('stripUrlFromBody: URL appearing twice removes both occurrences', () => {
  assert.equal(
    stripUrlFromBody('https://x.id/a lihat lagi https://x.id/a ya', 'https://x.id/a'),
    'lihat lagi ya',
  );
});

test('stripUrlFromBody: a different URL is left untouched', () => {
  assert.equal(stripUrlFromBody('lihat https://x.id/b', 'https://x.id/a'), 'lihat https://x.id/b');
});

test('stripUrlFromBody: empty/null url returns body unchanged', () => {
  assert.equal(stripUrlFromBody('lihat https://x.id/a', ''), 'lihat https://x.id/a');
  assert.equal(stripUrlFromBody('lihat https://x.id/a', null), 'lihat https://x.id/a');
  assert.equal(stripUrlFromBody('lihat https://x.id/a', undefined), 'lihat https://x.id/a');
});

test('stripUrlFromBody: removing a URL on its own line does not leave stray blank lines', () => {
  const body = 'baris satu\n\nhttps://x.id/a\n\nbaris tiga';
  assert.equal(stripUrlFromBody(body, 'https://x.id/a'), 'baris satu\n\nbaris tiga');
});
