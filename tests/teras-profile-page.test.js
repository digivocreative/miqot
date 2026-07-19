import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

test('header profil menampilkan nama, slug, dan WhatsApp hanya bila nomor bisa dinormalisasi', () => {
  const header = read('src/components/TerasProfileHeader.tsx');
  assert.match(header, /@\{slug\}/);
  assert.match(header, /https:\/\/wa\.me\/\$\{waNumber\}/);
  // Nomor di DB tidak dinormalisasi kecuali lewat /api/auth/register, jadi
  // "0812-3456-7890" harus lewat helper kanonik yang sama dengan seluruh call
  // site wa.me lain — replace(/\D/g,'') menghasilkan wa.me/081234567890 yang mati.
  assert.match(header, /import \{ normalizeWaNumber \} from '\.\.\/utils\/phone';/);
  assert.match(header, /const waNumber = normalizeWaNumber\(member\?\.phone\);/);
  assert.doesNotMatch(header, /replace\(\/\\D\/g, ''\)/);
  // null/'' dari normalizeWaNumber => tombol disembunyikan.
  assert.match(header, /\{waNumber \? \(/);
});

test('foto profil memakai penanganan error foto bersama, bukan <img> telanjang', () => {
  const header = read('src/components/TerasProfileHeader.tsx');
  assert.match(header, /import \{ getAgentInitials, handleAgentPhotoError \} from '\.\.\/lib\/agent-photo';/);
  assert.match(header, /onError=\{event => handleAgentPhotoError\(/);
  // Fallback inisial hanya dipakai setelah retry di handleAgentPhotoError habis.
  assert.match(header, /\(\) => setPhotoFailed\(true\),/);
  assert.match(header, /photo && !photoFailed \?/);
});

test('inisial header profil memakai helper bersama (tidak menyalin logika TerasPage)', () => {
  const header = read('src/components/TerasProfileHeader.tsx');
  const page = read('src/components/TerasPage.tsx');
  const shared = read('src/lib/agent-photo.ts');
  assert.match(shared, /export function getAgentInitials\(/);
  assert.match(header, /getAgentInitials\(name\)/);
  assert.match(page, /getAgentInitials\(name\)/);
  assert.doesNotMatch(page, /function getInitials\(/);
});

test('header profil punya fallback identitas dari slug dan skeleton saat roster berjalan', () => {
  const header = read('src/components/TerasProfileHeader.tsx');
  const page = read('src/components/TerasPage.tsx');
  // member boleh null: /api/community/members bisa gagal (catch-nya sengaja
  // diam) atau slug tidak ada di roster — header tetap harus punya identitas.
  assert.match(header, /member: MentionMember \| null;/);
  assert.match(header, /const name = member\?\.name \|\| slug;/);
  assert.match(header, /export function TerasProfileHeaderSkeleton\(/);

  assert.match(page, /const \[membersLoading, setMembersLoading\] = useState\(true\);/);
  assert.match(page, /if \(!controller\.signal\.aborted\) setMembersLoading\(false\);/);
  assert.match(
    page,
    /membersLoading && !profileMember \? \(\s*\n\s*<TerasProfileHeaderSkeleton \/>\s*\n\s*\) : \(\s*\n\s*<TerasProfileHeader member=\{profileMember\} slug=\{profileSlug\} \/>/,
  );
  // document.title tidak boleh mangkrak di "Teras" saat roster gagal/lambat.
  assert.match(page, /document\.title = `\$\{profileMember\?\.name \|\| profileSlug\} — Teras`;/);
});

test('postCountLabel (statistik profil, di luar scope spec) sudah dibuang', () => {
  const header = read('src/components/TerasProfileHeader.tsx');
  const page = read('src/components/TerasPage.tsx');
  assert.doesNotMatch(header, /postCountLabel/);
  assert.doesNotMatch(page, /postCountLabel/);
});

test('kiriman pending tidak pernah bocor ke profil agent lain', () => {
  const page = read('src/components/TerasPage.tsx');
  // Respons feed mode profil discope ke agent lain, jadi entri
  // pendingCreatedPostsRef tidak akan pernah dihapus oleh serverIds — kiriman
  // sendiri akan menempel di profil orang lain lintas navigasi dan menutupi
  // empty state "Belum ada kiriman".
  assert.match(page, /const pendingPosts = profileSlug\s*\n\s*\? \[\]\s*\n\s*: Array\.from\(pendingCreatedPostsRef\.current\.values\(\)\)/);
});

test('strip komposer (termasuk tombol kotak masuk mention) tidak dirender di mode profil', () => {
  const page = read('src/components/TerasPage.tsx');
  // Guard harus di <section>, bukan hanya di dalamnya — kalau tidak, sisa
  // pita kosong tipis + tombol kotak masuk melayang di atas header profil.
  assert.match(page, /\{!isDetailView && !profileSlug && \(\s*\n\s*<section className="border-b border-gray-100 bg-white px-4 py-2/);
});

test('agent bukan anggota Teras yang membuka /teras/<slug> melihat pesan "tidak tersedia"', () => {
  const layout = read('src/components/DashboardLayout.tsx');
  // Redirect diam-diam ke /dashboard hanya untuk /dashboard/teras; rute profil
  // harus menjelaskan kenapa halamannya tidak terbuka (spec baris 26 & 124-125).
  assert.match(layout, /const terasProfileRouteSlug = activeTab === 'teras' \? getTerasProfileSlugFromPath\(\) : null;/);
  assert.match(layout, /if \(activeTab === 'teras' && !terasEnabled && !terasProfileRouteSlug\) \{\s*\n\s*navigatePath\('\/dashboard', \{ replace: true \}\);/);
  assert.match(layout, /if \(terasProfileRouteSlug\) \{[\s\S]*?Halaman ini tidak tersedia/);
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
