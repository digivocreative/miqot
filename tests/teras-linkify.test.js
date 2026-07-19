import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkifySegments, firstUrl, stripUrlFromBody } from '../lib/teras-linkify.js';
import { firstUrlInText } from '../lib/community-link-preview.js';

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

test('linkifySegments: an uppercase HTTPS:// scheme is linkified too', () => {
  const segments = linkifySegments('cek HTTPS://x.id/a ya');
  assert.deepEqual(segments, [
    { type: 'text', value: 'cek ' },
    { type: 'link', value: 'HTTPS://x.id/a', href: 'HTTPS://x.id/a' },
    { type: 'text', value: ' ya' },
  ]);
});

test('linkifySegments: a closing paren that balances one INSIDE the URL is kept (Wikipedia-style link)', () => {
  const segments = linkifySegments('lihat https://en.wikipedia.org/wiki/Foo_(disambiguation) ya');
  assert.deepEqual(segments, [
    { type: 'text', value: 'lihat ' },
    {
      type: 'link',
      value: 'https://en.wikipedia.org/wiki/Foo_(disambiguation)',
      href: 'https://en.wikipedia.org/wiki/Foo_(disambiguation)',
    },
    { type: 'text', value: ' ya' },
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

test('stripUrlFromBody: does not corrupt a longer URL that shares the removed URL as a prefix', () => {
  const result = stripUrlFromBody('cek https://x.id/a dan https://x.id/abc juga', 'https://x.id/a');
  assert.equal(result, 'cek dan https://x.id/abc juga');
  // The surviving URL must still be fully intact and linkifiable, not
  // truncated into a dangling "bc" fragment.
  assert.deepEqual(
    linkifySegments(result).filter(segment => segment.type === 'link'),
    [{ type: 'link', value: 'https://x.id/abc', href: 'https://x.id/abc' }],
  );
});

test('stripUrlFromBody: removal still works when the URL is followed by a newline', () => {
  assert.equal(stripUrlFromBody('lihat https://x.id/a\nbaris baru', 'https://x.id/a'), 'lihat\nbaris baru');
});

test('stripUrlFromBody: removal still works when the URL is followed by trailing "." or ","', () => {
  assert.equal(stripUrlFromBody('lihat https://x.id/a. oke', 'https://x.id/a'), 'lihat . oke');
  assert.equal(stripUrlFromBody('lihat https://x.id/a, oke', 'https://x.id/a'), 'lihat , oke');
});

test('stripUrlFromBody: an occurrence glued to preceding text (no boundary) is left alone', () => {
  assert.equal(
    stripUrlFromBody('cekhttps://x.id/a checked', 'https://x.id/a'),
    'cekhttps://x.id/a checked',
  );
});

// `.` / `?` / `:` are ambiguous: each is a legitimate mid-URL character
// (file extension, query string, port) as well as ordinary sentence
// punctuation right after a URL. continuesUrl must only treat a RUN of these
// as "still part of the URL" when a genuine URL-continuation character
// immediately follows the run — otherwise a trailing "?" or ":" right after
// the pasted URL (an entirely ordinary way to post: "sudah lihat <link>?")
// makes stripUrlFromBody refuse to remove it, so the raw URL stays visible
// in the body alongside the preview card.
test('stripUrlFromBody: removes the URL even when followed by a trailing "?", ":", or "..." with nothing URL-like after', () => {
  assert.equal(
    stripUrlFromBody('sudah lihat https://x.id/a?', 'https://x.id/a'),
    'sudah lihat ?',
  );
  assert.equal(
    stripUrlFromBody('link https://x.id/a: keren', 'https://x.id/a'),
    'link : keren',
  );
  assert.equal(
    stripUrlFromBody('akhir https://x.id/a...', 'https://x.id/a'),
    'akhir ...',
  );
  assert.equal(
    stripUrlFromBody('ini https://x.id/a?!', 'https://x.id/a'),
    'ini ?!',
  );
});

test('stripUrlFromBody: regression guards for the ambiguous-trailing-char rule', () => {
  // A trailing "." followed by a real URL-continuation char (here "html")
  // still belongs to the URL — the whole thing must be removed, not just
  // the part before the dot.
  assert.equal(
    stripUrlFromBody('ini https://x.id/a.html juga', 'https://x.id/a.html'),
    'ini juga',
  );
  // A "?" followed by more query-string characters ("q=1") still belongs to
  // the URL.
  assert.equal(
    stripUrlFromBody('x https://x.id/a?q=1 y', 'https://x.id/a?q=1'),
    'x y',
  );
  // Prefix-corruption guard: removing the shorter URL must not touch a
  // longer, different URL that merely starts with the same characters.
  assert.equal(
    stripUrlFromBody('a https://x.id/a dan https://x.id/abc', 'https://x.id/a'),
    'a dan https://x.id/abc',
  );
});

// Boundary invariant: firstUrlInText (server-side link-preview detector,
// lib/community-link-preview.js) MUST agree, on every body, with what the
// renderer actually linkifies (linkifySegments) — otherwise the server
// fetches OG metadata for a URL the client renders/strips differently, and a
// preview card + a raw, un-hidden URL end up on screen together. Previously
// three independent regexes disagreed on ordinary sentences; this test
// pins the invariant so a future edit to either side can't silently
// reintroduce the split.
test('firstUrlInText agrees with linkifySegments\' first link href (single source of truth)', () => {
  const bodies = [
    'sudah lihat https://x.id/a?',
    'link https://x.id/a: keren',
    'nested https://x.id/f(o)o lanjut',
    'lihat https://id.wikipedia.org/wiki/Haji_(disambiguasi) ya',
    'halo dunia tanpa url',
    'https://a.id lalu https://b.id',
    'lihat https://x.id/a.',
    '(https://x.id/a)',
    'cek https://x.com/@bagas dong',
    'cek HTTPS://x.id/a ya',
  ];
  for (const body of bodies) {
    const expected = linkifySegments(body).find(segment => segment.type === 'link')?.href ?? null;
    assert.equal(firstUrlInText(body), expected, `firstUrlInText harus sepakat dengan linkifySegments untuk: ${JSON.stringify(body)}`);
    assert.equal(firstUrl(body), expected, `firstUrl harus sepakat dengan linkifySegments untuk: ${JSON.stringify(body)}`);
  }
});
