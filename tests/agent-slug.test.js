import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isReservedAgentSlug } from '../lib/agent-slug.js';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('slug rute inti tetap terpesan', () => {
  for (const slug of ['admin', 'login', 'register', 'dashboard', 'api', 'compare', 'reset-password', 'f']) {
    assert.equal(isReservedAgentSlug(slug), true, `${slug} harus terpesan`);
  }
});

test('teras terpesan supaya tidak menabrak cabang /teras/*', () => {
  assert.equal(isReservedAgentSlug('teras'), true);
  assert.equal(isReservedAgentSlug('TERAS'), true);
});

test('slug berbentuk 8-hex terpesan supaya tidak tertukar dengan kode share', () => {
  assert.equal(isReservedAgentSlug('abcdefab'), true);
  assert.equal(isReservedAgentSlug('9fc969b0'), true);
  assert.equal(isReservedAgentSlug('deadbeef'), true);
});

test('slug agent normal tidak terpesan', () => {
  for (const slug of ['nila', 'nikita', 'agent-satu', 'abcdefa', 'abcdefabc', 'nikitaaz']) {
    assert.equal(isReservedAgentSlug(slug), false, `${slug} harus boleh`);
  }
});

test('server memakai isReservedAgentSlug di kedua jalur validasi slug', () => {
  const server = read('server.js');
  assert.match(server, /import \{ isReservedAgentSlug \} from '\.\/lib\/agent-slug\.js';/);
  const uses = server.match(/isReservedAgentSlug\(/g) || [];
  assert.ok(uses.length >= 2, `harus dipakai di registrasi dan ubah-username, ditemukan ${uses.length}`);
  assert.doesNotMatch(server, /const RESERVED_SLUGS = \[/);
});

test('teras masuk RESERVED_SPA_SLUGS supaya server tidak inject OG agent', () => {
  const server = read('server.js');
  assert.match(server, /const RESERVED_SPA_SLUGS = new Set\(\[[^\]]*'teras'/);
});
