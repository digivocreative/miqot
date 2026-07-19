import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  firstUrlInText,
  isBlockedAddress,
  isAllowedPreviewUrl,
  parseOpenGraph,
  sanitizeLinkPreview,
} from '../lib/community-link-preview.js';

test('firstUrlInText picks the first http(s) URL', () => {
  assert.equal(
    firstUrlInText('lihat https://www.detik.com/a/b lalu http://x.id'),
    'https://www.detik.com/a/b',
  );
  assert.equal(firstUrlInText('tidak ada tautan di sini'), null);
  assert.equal(firstUrlInText('email a@b.com bukan url'), null);
});

test('isBlockedAddress flags private/loopback/link-local', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.1.1', '::1', 'fc00::1', '0.0.0.0']) {
    assert.equal(isBlockedAddress(ip), true, `${ip} harus diblokir`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '203.0.113.10', '2606:4700:4700::1111']) {
    assert.equal(isBlockedAddress(ip), false, `${ip} harus diizinkan`);
  }
});

test('isAllowedPreviewUrl rejects non-http, localhost, bare host, private IP literal', () => {
  assert.equal(isAllowedPreviewUrl('https://www.detik.com/a'), true);
  assert.equal(isAllowedPreviewUrl('http://example.co.id'), true);
  assert.equal(isAllowedPreviewUrl('ftp://example.com'), false);
  assert.equal(isAllowedPreviewUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedPreviewUrl('http://localhost/x'), false);
  assert.equal(isAllowedPreviewUrl('http://intranet/x'), false); // no dot
  assert.equal(isAllowedPreviewUrl('http://127.0.0.1/x'), false);
  assert.equal(isAllowedPreviewUrl('http://192.168.0.5/x'), false);
  assert.equal(isAllowedPreviewUrl('not a url'), false);
});

test('isAllowedPreviewUrl blocks IPv6-embedded-IPv4 SSRF bypasses', () => {
  // Node's WHATWG URL parser normalizes these bracketed literals into
  // hex-group IPv6 form before isBlockedAddress ever sees them, e.g.
  // "[::127.0.0.1]" -> hostname "[::7f00:1]". All must still be blocked.
  for (const url of [
    'http://[::127.0.0.1]/',           // -> [::7f00:1]     IPv4-compatible loopback
    'http://[::169.254.169.254]/',     // -> [::a9fe:a9fe]  cloud metadata endpoint
    'http://[::192.168.1.1]/',         // -> [::c0a8:101]   RFC1918 private
    'http://[64:ff9b::192.168.1.1]/',  // -> [64:ff9b::c0a8:101] NAT64 well-known prefix
    'http://[::ffff:127.0.0.1]/',      // -> [::ffff:7f00:1] IPv4-mapped loopback
    'http://[fe80::1]/',               // link-local
    'http://[fc00::1]/',               // unique-local
    'http://[fec0::1]/',               // site-local (deprecated)
  ]) {
    assert.equal(isAllowedPreviewUrl(url), false, `${url} harus diblokir`);
  }
});

test('isAllowedPreviewUrl allows legitimate public IPv6 literals', () => {
  assert.equal(isAllowedPreviewUrl('http://[2606:4700:4700::1111]/'), true);
  assert.equal(isAllowedPreviewUrl('http://[::ffff:8.8.8.8]/'), true);
});

test('isBlockedAddress evaluates normalized IPv6-embedded-IPv4 hex forms directly', () => {
  for (const ip of ['::a9fe:a9fe', '::7f00:1', '64:ff9b::c0a8:101']) {
    assert.equal(isBlockedAddress(ip), true, `${ip} harus diblokir`);
  }
  assert.equal(isBlockedAddress('2606:4700:4700::1111'), false);
});

test('parseOpenGraph reads og tags and resolves relative image', () => {
  const html = `<html><head>
    <meta property="og:title" content="Judul Berita">
    <meta property="og:description" content="Ringkasan berita.">
    <meta property="og:image" content="/img/thumb.jpg">
    <meta property="og:site_name" content="detikcom">
    <meta property="og:url" content="https://www.detik.com/canonical">
  </head></html>`;
  assert.deepEqual(parseOpenGraph(html, 'https://www.detik.com/a/b'), {
    url: 'https://www.detik.com/a/b',
    canonical_url: 'https://www.detik.com/canonical',
    title: 'Judul Berita',
    description: 'Ringkasan berita.',
    image: 'https://www.detik.com/img/thumb.jpg',
    site_name: 'detikcom',
  });
});

test('parseOpenGraph falls back to twitter then <title>', () => {
  const twitter = `<meta name="twitter:title" content="TW Title">
    <meta name="twitter:image" content="https://x.id/i.png">`;
  const p1 = parseOpenGraph(twitter, 'https://x.id/');
  assert.equal(p1.title, 'TW Title');
  assert.equal(p1.image, 'https://x.id/i.png');

  const titleOnly = `<html><head><title>Cuma Title</title></head></html>`;
  const p2 = parseOpenGraph(titleOnly, 'https://x.id/');
  assert.equal(p2.title, 'Cuma Title');
});

test('parseOpenGraph returns null when nothing useful', () => {
  assert.equal(parseOpenGraph('<html><body>halo</body></html>', 'https://x.id/'), null);
});

test('sanitizeLinkPreview trims, caps length, drops non-https image, requires url+something', () => {
  const cleaned = sanitizeLinkPreview({
    url: 'https://x.id/a',
    title: 'T'.repeat(500),
    description: 'D'.repeat(500),
    image: 'https://x.id/i.png',
    site_name: 'S'.repeat(300),
    junk: 'buang',
  });
  assert.equal(cleaned.url, 'https://x.id/a');
  assert.equal(cleaned.title.length, 200);
  assert.equal(cleaned.description.length, 300);
  assert.equal(cleaned.site_name.length, 100);
  assert.equal('junk' in cleaned, false);

  assert.equal(sanitizeLinkPreview({ url: 'https://x.id', image: 'http://x.id/i.png' }), null,
    'image http (non-https) dibuang; tanpa title/image lain → null');
  assert.equal(sanitizeLinkPreview({ title: 'T' }), null, 'tanpa url → null');
  assert.equal(sanitizeLinkPreview(null), null);
});
