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
  // Cocokkan tiap tag <MentionText ... /> secara individual (bukan menghitung
  // kemunculan onOpenProfile={openProfile} di seluruh berkas) -- sejak
  // CommentThread diekstrak, TerasPage juga meneruskan prop onOpenProfile ke
  // <CommentThread>, yang bentuk teksnya identik dan akan mengembang hitungan
  // kalau dua pola dihitung terpisah.
  const uses = page.match(/<MentionText\b[^>]*\/>/g) || [];
  assert.ok(uses.length > 0, 'expected at least one <MentionText /> usage in TerasPage.tsx');
  const wired = uses.filter(tag => /onOpenProfile=\{openProfile\}/.test(tag));
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

test('all four post/comment author links bail out on a modified click (review fix Task 6)', () => {
  // Rekonsiliasi Teras memindahkan rendering komentar (avatar + nama penulis
  // komentar) dari TerasPage.tsx ke src/components/teras/CommentThread.tsx.
  // Post author links tetap di TerasPage.tsx; comment author links sekarang
  // ada di CommentThread.tsx. Perilaku (4 tautan, semua menjaga modified
  // click) harus tetap sama persis -- cuma lokasinya yang terbagi dua berkas.
  const page = read('src/components/TerasPage.tsx');
  const commentThread = read('src/components/teras/CommentThread.tsx');
  assert.match(page, /import \{ isModifiedClick, terasProfilePath \} from '\.\.\/lib\/terasRoutes';/);
  assert.match(commentThread, /import \{ isModifiedClick, terasProfilePath \} from '\.\.\/\.\.\/lib\/terasRoutes';/);

  const pageGuardCount = (page.match(/if \(isModifiedClick\(event\)\) return;/g) || []).length;
  assert.equal(pageGuardCount, 2, 'post author avatar and name links in TerasPage must guard modified clicks');

  const commentGuardCount = (commentThread.match(/if \(isModifiedClick\(event\)\) return;/g) || []).length;
  assert.equal(commentGuardCount, 2, 'comment author avatar and name links in CommentThread must guard modified clicks');

  // Each guard must sit directly ahead of preventDefault/stopPropagation/openProfile —
  // not merely appear somewhere in the file — for both the avatar and the name link,
  // for both a post author (TerasPage) and a comment author (CommentThread).
  const postGuardedBlockPattern =
    /if \(isModifiedClick\(event\)\) return;\s*\n\s*event\.preventDefault\(\);\s*\n\s*event\.stopPropagation\(\);\s*\n\s*openProfile\(authorSlug\);/g;
  const postGuardedBlocks = page.match(postGuardedBlockPattern) || [];
  assert.equal(postGuardedBlocks.length, 2, 'post avatar + name links');

  const commentGuardedBlockPattern =
    /if \(isModifiedClick\(event\)\) return;\s*\n\s*event\.preventDefault\(\);\s*\n\s*event\.stopPropagation\(\);\s*\n\s*onOpenProfile\(commentAuthorSlug\);/g;
  const commentGuardedBlocks = commentThread.match(commentGuardedBlockPattern) || [];
  assert.equal(commentGuardedBlocks.length, 2, 'comment avatar + name links');
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
