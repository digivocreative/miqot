import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visitorScheme, isHttpsRequest, isHttpsOnlyPagePath } from '../lib/request-scheme.js';

const req = (headers = {}, secure = false) => ({ headers, secure });

test('visitorScheme: CF-Visitor menang atas X-Forwarded-Proto http dari nginx', () => {
  // Persis header yang terukur di produksi (tcpdump 2026-10-11).
  assert.equal(visitorScheme(req({ 'x-forwarded-proto': 'http', 'cf-visitor': '{"scheme":"https"}' })), 'https');
  assert.equal(visitorScheme(req({ 'x-forwarded-proto': 'http', 'cf-visitor': '{"scheme":"http"}' })), 'http');
});

test('visitorScheme: Caddy (custom domain) dan req.secure dipercaya sebagai https', () => {
  assert.equal(visitorScheme(req({ 'x-forwarded-proto': 'https' })), 'https');
  assert.equal(visitorScheme(req({}, true)), 'https');
});

test('visitorScheme: tanpa petunjuk / header rusak = tak diketahui, bukan http', () => {
  assert.equal(visitorScheme(req({ 'x-forwarded-proto': 'http' })), null);
  assert.equal(visitorScheme(req({ 'cf-visitor': 'bukan-json' })), null);
  assert.equal(visitorScheme(undefined), null);
  assert.equal(isHttpsRequest(req({ 'x-forwarded-proto': 'http' })), false);
});

test('isHttpsOnlyPagePath: halaman portal & reset password saja', () => {
  for (const path of ['/j/ab12cd34', '/nikita/jamaah', '/nikita/jamaah/', '/nikita/jamaah/ab12cd34/dashboard', '/jamaah/ab12cd34', '/reset-password']) {
    assert.equal(isHttpsOnlyPagePath(path), true, path);
  }
  for (const path of ['/', '/nikita', '/nikita/bio', '/api/portal/login', '/j', '/dashboard/jamaah', '/nikita/jamaah-baru']) {
    assert.equal(isHttpsOnlyPagePath(path), false, path);
  }
});
