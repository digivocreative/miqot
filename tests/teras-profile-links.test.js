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

test('isModifiedClick helper checks every modifier key and non-primary button', () => {
  const routes = read('src/lib/terasRoutes.ts');
  assert.match(routes, /export function isModifiedClick/);
  assert.match(routes, /event\.button != null && event\.button !== 0/);
  assert.match(routes, /event\.metaKey/);
  assert.match(routes, /event\.ctrlKey/);
  assert.match(routes, /event\.shiftKey/);
  assert.match(routes, /event\.altKey/);
});

test('mention pill link bails out on a modified click before hijacking navigation (review fix Task 6)', () => {
  const mention = read('src/components/MentionText.tsx');
  assert.match(mention, /import \{ isModifiedClick, terasProfilePath \} from '\.\.\/lib\/terasRoutes';/);
  // The guard must run BEFORE preventDefault/stopPropagation so a Cmd/Ctrl/Shift-click
  // (or middle-click) falls through to the browser's native new-tab/new-window behaviour.
  assert.match(
    mention,
    /if \(isModifiedClick\(event\)\) return;\s*\n\s*event\.preventDefault\(\);\s*\n\s*event\.stopPropagation\(\);\s*\n\s*onOpenProfile\(segment\.slug\);/,
  );
});

test('all four post/comment author links in TerasPage bail out on a modified click (review fix Task 6)', () => {
  const page = read('src/components/TerasPage.tsx');
  assert.match(page, /import \{ isModifiedClick, terasProfilePath \} from '\.\.\/lib\/terasRoutes';/);

  const guardCount = (page.match(/if \(isModifiedClick\(event\)\) return;/g) || []).length;
  assert.equal(
    guardCount,
    4,
    'post author avatar, post author name, comment author avatar, and comment author name links must all guard modified clicks',
  );

  // Each guard must sit directly ahead of preventDefault/stopPropagation/openProfile —
  // not merely appear somewhere in the file — for both the avatar and the name link,
  // for both a post author and a comment author.
  const guardedBlockPattern =
    /if \(isModifiedClick\(event\)\) return;\s*\n\s*event\.preventDefault\(\);\s*\n\s*event\.stopPropagation\(\);\s*\n\s*openProfile\((authorSlug|commentAuthorSlug)\);/g;
  const guardedBlocks = page.match(guardedBlockPattern) || [];
  assert.equal(guardedBlocks.length, 4);
  assert.equal(guardedBlocks.filter(block => block.includes('openProfile(authorSlug)')).length, 2, 'post avatar + name links');
  assert.equal(
    guardedBlocks.filter(block => block.includes('openProfile(commentAuthorSlug)')).length,
    2,
    'comment avatar + name links',
  );
});

test('pesan kosong profil memakai feedPosts, bukan posts mentah (review fix Task 5)', () => {
  const page = read('src/components/TerasPage.tsx');
  // TerasPage tidak di-remount antara rute detail post dan rute profil, jadi
  // detailOnlyIdsRef bisa membawa sisa post yang cuma dilihat lewat detail ke
  // kunjungan profil berikutnya. posts.length===0 di sini akan salah anggap
  // sisa itu sebagai "ada kiriman" dan menampilkan pesan kosong feed umum,
  // bukan pesan kosong profil — harus feedPosts (yang sudah difilter).
  // Cabang ini sudah berada di dalam `!loading && !error && feedPosts.length
  // === 0`, jadi konjungsi itu diulang percuma; yang penting pembeda profil
  // dipilih SETELAH feedPosts (bukan posts mentah) dinyatakan kosong.
  assert.match(page, /\) : feedPosts\.length === 0 \? \([\s\S]{0,400}?profileSlug \? \(/);
  assert.doesNotMatch(page, /\) : posts\.length === 0 \? \(/);
  assert.doesNotMatch(page, /profileSlug && !loading && !error && feedPosts\.length === 0/);
});
