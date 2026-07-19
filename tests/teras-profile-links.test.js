import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('pill mention jadi tautan ke profil saat onOpenProfile diberikan', () => {
  const mention = read('src/components/MentionText.tsx');
  assert.match(mention, /onOpenProfile\?: \(slug: string\) => void/);
  assert.match(mention, /terasProfilePath\(segment\.slug\)/);
  assert.match(mention, /event\.preventDefault\(\)/);
  assert.match(mention, /event\.stopPropagation\(\)/);
});

test('TerasPage meneruskan onOpenProfile ke setiap MentionText', () => {
  const page = read('src/components/TerasPage.tsx');
  const uses = page.match(/<MentionText\b/g) || [];
  const wired = page.match(/onOpenProfile=\{openProfile\}/g) || [];
  assert.equal(wired.length, uses.length, 'semua MentionText harus diberi onOpenProfile');
});

test('nama dan avatar penulis post/komentar menautkan ke profil', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /const openProfile = useCallback\(/);
  assert.match(page, /terasProfilePath\(/);
  // Post sistem tidak jadi tautan.
  assert.match(page, /post\.is_system/);
});

test('pesan kosong profil memakai feedPosts, bukan posts mentah (review fix Task 5)', () => {
  const page = read('src/components/TerasPage.tsx');
  // TerasPage tidak di-remount antara rute detail post dan rute profil, jadi
  // detailOnlyIdsRef bisa membawa sisa post yang cuma dilihat lewat detail ke
  // kunjungan profil berikutnya. posts.length===0 di sini akan salah anggap
  // sisa itu sebagai "ada kiriman" dan menampilkan pesan kosong feed umum,
  // bukan pesan kosong profil — harus feedPosts (yang sudah difilter).
  assert.match(page, /profileSlug && !loading && !error && feedPosts\.length === 0 \? \(/);
  assert.doesNotMatch(page, /profileSlug && !loading && !error && posts\.length === 0/);
});
