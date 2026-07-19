import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('header profil menampilkan nama, slug, dan WhatsApp hanya bila ada nomor', () => {
  const header = read('src/components/TerasProfileHeader.tsx');
  assert.match(header, /@\{member\.slug\}/);
  assert.match(header, /member\.phone \?/);
  assert.match(header, /https:\/\/wa\.me\//);
});

test('feed mode profil memakai query agent', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /params\.set\('agent', profileSlug\)/);
});

test('composer dan pil kiriman baru disembunyikan di mode profil', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /!profileSlug && /);
  assert.match(page, /hasNewPosts && !profileSlug/);
});

test('mode profil punya pesan kosong dan agent tidak ditemukan', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /Belum ada kiriman/);
  assert.match(page, /Agent tidak ditemukan di Teras/);
});
