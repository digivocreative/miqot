// Penjaga sumber, bukan tes perilaku: memastikan setiap query yang menampilkan
// DAFTAR kiriman menyaring segmen lanjutan utas. Kalau tidak, satu utas 5
// segmen akan mengubur kiriman agen lain di linimasa — regresi yang tidak
// menimbulkan error, cuma feed yang pelan-pelan salah.
//
// Spec "komentar jadi kiriman penuh" (R3-R8) melonggarkan profil: balasan
// (is_reply=true) kini ikut tampil di profil penulisnya dengan konteks
// "Membalas ke @X", sementara linimasa (non-profil) dan semua sumber lain
// (feed head, teaser, unread, broadcast, hitungan comment/thread, notifikasi
// commentQuery) tetap menyaring penuh atau memakai is_reply sebagai pembeda.
// Daftar di bawah DIPERBARUI mengikuti perilaku baru itu -- bukan dihapus.
// Lihat memo [[teras-utas-composer]].

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');

/** Ambil isi fungsi/blok mulai dari sebuah penanda sampai n baris berikutnya. */
function sliceAfter(marker, lines = 30) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `penanda tidak ditemukan di server.js: ${marker}`);
  return source.slice(index).split('\n').slice(0, lines).join('\n');
}

// Query yang MASIH menyaring PENUH (hanya kiriman induk / non-utas), tidak
// tersentuh oleh pelonggaran profil -- tetap dikunci generik seperti semula.
const GUARDED = [
  ['function loadCommunityFeedHead', 'head feed (pill kiriman baru)'],
  ['const broadcastQuery = ', 'sumber broadcast @semua di lonceng'],
];

for (const [marker, label] of GUARDED) {
  test(`${label} menyaring segmen lanjutan utas`, () => {
    assert.match(
      sliceAfter(marker, 30),
      /parent_post_id/,
      `${label} harus menyaring parent_post_id IS NULL`,
    );
  });
}

test('linimasa (non-profil) di buildPostsQuery tetap menyaring penuh', () => {
  const block = sliceAfter('const buildPostsQuery = ', 60);
  assert.match(
    block,
    /if \(includeThread && !profileMember\)/,
    'harus ada percabangan khusus linimasa (bukan profil)',
  );
  assert.match(
    block,
    /query = query\.is\('parent_post_id', null\);/,
    'cabang linimasa (non-profil) harus tetap .is(parent_post_id, null) -- balasan tidak boleh bocor ke linimasa',
  );
});

test('profil di buildPostsQuery menampilkan balasan (is_reply), bukan disaring penuh', () => {
  const block = sliceAfter('const buildPostsQuery = ', 60);
  assert.match(
    block,
    /is_reply\.eq\.true/,
    'cabang profil harus mengizinkan balasan (is_reply=true) tampil',
  );
  assert.match(
    block,
    /query\.or\('parent_post_id\.is\.null,is_reply\.eq\.true'\)/,
    'cabang profil tanpa cursor harus menggabungkan parent_post_id NULL dan is_reply=true, bukan disaring parent_post_id saja',
  );
});

test('teaser (12 terbaru + hitung hari ini) menyaring segmen lanjutan', () => {
  const block = sliceAfter('const [latestResult, todayResult] = await Promise.all(', 24);
  const matches = block.match(/parent_post_id/g) || [];
  assert.equal(matches.length, 2, 'kedua query teaser harus disaring, bukan salah satu');
});

test('hitung belum-dibaca menyaring segmen lanjutan', () => {
  assert.match(sliceAfter('let unreadQuery = supabase', 12), /parent_post_id/);
});

test('comment_count feed (loadCommunityEngagementMaps) menghitung is_reply=true', () => {
  assert.match(
    sliceAfter('const COMMENT_COUNT_LIMIT = 2000;', 16),
    /\.eq\('is_reply', true\)/,
    'comment_count feed harus menghitung balasan (is_reply=true), bukan seluruh anak parent_post_id (yang juga mencakup segmen lanjutan utas)',
  );
});

test('comment_count detail menghitung is_reply=true', () => {
  assert.match(
    sliceAfter('is_reply=true wajib supaya segmen lanjutan utas', 12),
    /\.eq\('is_reply', true\)/,
    'comment_count di endpoint detail harus menghitung balasan (is_reply=true)',
  );
});

test('thread_count feed menghitung is_reply=false (mengecualikan balasan)', () => {
  assert.match(
    sliceAfter('const threadCounts = new Map(postIds.map(postId => [postId, 0]));', 14),
    /\.eq\('is_reply', false\)/,
    'thread_count feed harus mengecualikan balasan (is_reply=true) dari hitungan segmen utas',
  );
});

test('daftar segmen utas di endpoint detail menyaring is_reply=false', () => {
  assert.match(
    sliceAfter('const threadRootId = post.root_post_id || post.id;', 14),
    /\.eq\('is_reply', false\)/,
    'array thread di endpoint detail harus mengecualikan balasan (is_reply=true) dari rantai segmen',
  );
});

test('commentQuery notifikasi bersumber balasan (is_reply=true) dari community_posts', () => {
  const block = sliceAfter('const commentQuery = ', 14);
  assert.match(
    block,
    /\.from\('community_posts'\)/,
    'commentQuery harus bersumber dari community_posts (bukan community_post_comments lama)',
  );
  assert.match(
    block,
    /\.eq\('is_reply', true\)/,
    'commentQuery harus menyaring is_reply=true (balasan), bukan segmen lanjutan utas lain yang juga ber-parent_post_id',
  );
  assert.match(
    block,
    /parent_post_id/,
    'commentQuery masih perlu memeriksa relasi induk lewat parent_post_id',
  );
});

test('ketiga lookup kutipan TIDAK disaring', () => {
  // Temukan semua deklarasi buildQuotedQuery di server.js
  const marker = 'const buildQuotedQuery = ';
  const quotedQueryDeclarations = [];
  let searchStart = 0;

  while (true) {
    const index = source.indexOf(marker, searchStart);
    if (index === -1) break;
    quotedQueryDeclarations.push(index);
    searchStart = index + 1;
  }

  // Harus ada tepat 3 deklarasi; jika berubah, perbaharui tes ini
  assert.equal(
    quotedQueryDeclarations.length,
    3,
    'harus ada 3 deklarasi buildQuotedQuery di server.js',
  );

  // Setiap deklarasi harus TIDAK menyaring parent_post_id
  // mengutip satu segmen utas (reply) itu fitur sah, jangan hapus
  quotedQueryDeclarations.forEach((index, i) => {
    const window = source.slice(index, index + 400);
    assert.doesNotMatch(
      window,
      /parent_post_id/,
      `deklarasi buildQuotedQuery #${i + 1} harus TIDAK menyaring parent_post_id`,
    );
  });
});
