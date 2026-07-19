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

test('composer tidak bisa dibuka sama sekali di mode profil (termasuk lewat tombol Quote)', () => {
  const page = read('src/components/TerasPage.tsx');
  // openComposer adalah satu-satunya tempat setComposerOpen(true) dipanggil
  // (tombol composer utama maupun openQuoteComposer sama-sama lewat sini),
  // jadi guard-nya harus ada DI SINI dan mendahului setComposerOpen(true) —
  // kalau guard ini dicabut atau dipindah, composerOpen tetap bisa jadi true
  // di mode profil walau sheet-nya tidak pernah dirender (root jadi inert
  // & terkunci scroll tanpa modal yang bisa diklik).
  assert.match(
    page,
    /const openComposer = \(openPhotoPicker = false\) => \{[\s\S]*?if \(profileSlug\) return;[\s\S]*?setComposerOpen\(true\)/,
  );
  // Pertahanan kedua di jalur Quote itu sendiri, supaya openQuoteComposer
  // tidak menulis state composerQuote yang percuma di mode profil.
  assert.match(
    page,
    /const openQuoteComposer = \(post: CommunityPost\) => \{\s*\n\s*if \(profileSlug\) return;/,
  );
});

test('fetchFeed: first load di mode profil selalu layar penuh, tidak toast walau ada pending post dari feed lama', () => {
  const page = read('src/components/TerasPage.tsx');
  // pendingCreatedPostsRef bertahan lintas navigasi feed -> profil. Cabang
  // toast harus di-skip dengan !profileSlug supaya 404 pertama sebuah
  // profil selalu jatuh ke setError(message), bukan showToast.
  assert.match(
    page,
    /else if \(!profileSlug && \(postsRef\.current\.length > 0 \|\| pendingCreatedPostsRef\.current\.size > 0\)\) showToast\(message, 'error'\);/,
  );
});

test('profileMember mencocokkan slug case-insensitive seperti server', () => {
  const page = read('src/components/TerasPage.tsx');
  // Server (/api/community/feed) me-lowercase-kan query agent maupun slug
  // anggota sebelum dibandingkan. Client harus pakai memberBySlug (key-nya
  // sudah toLowerCase()) supaya slug beda kapital tidak diam-diam gagal
  // cocok di sini (header/title kosong) walau feed di server tetap berhasil.
  assert.match(page, /const profileMember = profileSlug\s*\n\s*\? memberBySlug\.get\(profileSlug\.toLowerCase\(\)\) \|\| null/);
  assert.doesNotMatch(page, /mentionMembers\.find\(member => member\.slug === profileSlug\)/);
});
