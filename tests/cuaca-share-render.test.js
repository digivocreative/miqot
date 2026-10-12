import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCuacaShellHtml,
  fetchAgentPhotoDataUri,
  isAllowedAgentPhotoUrl,
  loadCuacaShareAssets,
} from '../lib/cuaca-share-render.js';

const okImage = (type = 'image/jpeg', size = 4) => async () => ({
  ok: true,
  headers: { get: () => type },
  arrayBuffer: async () => new Uint8Array(size).buffer,
});

test('agent photo hosts are allow-listed and https only', () => {
  assert.equal(isAllowedAgentPhotoUrl('https://sb.alhijaz.co/storage/v1/object/public/agent-photos/a.jpg'), true);
  assert.equal(isAllowedAgentPhotoUrl('https://ui-avatars.com/api/?name=A'), true);
  assert.equal(isAllowedAgentPhotoUrl('http://sb.alhijaz.co/a.jpg'), false);
  assert.equal(isAllowedAgentPhotoUrl('https://evil.example/a.jpg'), false);
  assert.equal(isAllowedAgentPhotoUrl('https://127.0.0.1/a.jpg'), false);
  assert.equal(isAllowedAgentPhotoUrl(''), false);
});

test('agent photo fetch degrades to null instead of failing the render', async () => {
  const url = 'https://sb.alhijaz.co/a.jpg';
  assert.match(await fetchAgentPhotoDataUri(url, { fetchImpl: okImage() }), /^data:image\/jpeg;base64,/);
  assert.equal(await fetchAgentPhotoDataUri('https://evil.example/a.jpg', { fetchImpl: okImage() }), null);
  assert.equal(await fetchAgentPhotoDataUri(url, { fetchImpl: okImage('text/html') }), null);
  assert.equal(await fetchAgentPhotoDataUri(url, { fetchImpl: okImage('image/png', 3 * 1024 * 1024 + 1) }), null);
  assert.equal(await fetchAgentPhotoDataUri(url, { fetchImpl: async () => ({ ok: false, headers: { get: () => '' } }) }), null);
  assert.equal(await fetchAgentPhotoDataUri(url, { fetchImpl: async () => { throw new Error('timeout'); } }), null);
});

test('agent photo fetch refuses redirects (allow-list cannot be bypassed)', async () => {
  let opts = null;
  await fetchAgentPhotoDataUri('https://sb.alhijaz.co/a.jpg', { fetchImpl: async (_u, o) => { opts = o; return { ok: false, headers: { get: () => '' } }; } });
  assert.equal(opts.redirect, 'error');
});

test('assets embed the city photo and logo as data URIs; Hainan has no photo', async () => {
  const withPhoto = await loadCuacaShareAssets({ photo: 'makkah.jpg' }, '', {});
  assert.match(withPhoto.photoSrc, /^data:image\/jpeg;base64,/);
  assert.match(withPhoto.logoSrc, /^data:image\/svg\+xml;base64,/);
  assert.equal(withPhoto.agentPhotoSrc, null);
  const noPhoto = await loadCuacaShareAssets({ photo: null }, '', {});
  assert.equal(noPhoto.photoSrc, null);
});

test('shell html escapes "<" so payload strings cannot close the script tag', () => {
  const html = buildCuacaShellHtml({ data: { cityName: '</script><script>alert(1)</script>' } }, { bundle: '', fontCss: '' });
  assert.doesNotMatch(html, /<\/script><script>alert/);
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /<div id="banner"><\/div>/);
});
