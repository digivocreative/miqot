// Penjaga sumber, bukan tes perilaku: memastikan setiap query yang menampilkan
// DAFTAR kiriman menyaring segmen lanjutan utas. Kalau tidak, satu utas 5
// segmen akan mengubur kiriman agen lain di linimasa — regresi yang tidak
// menimbulkan error, cuma feed yang pelan-pelan salah.
//
// Saat spec "komentar jadi kiriman penuh" mendarat dan melonggarkan query
// profil, PERBARUI daftar ini — jangan hapus tesnya.

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

const GUARDED = [
  ['const buildPostsQuery = ', 'linimasa utama & profil agen'],
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

test('teaser (12 terbaru + hitung hari ini) menyaring segmen lanjutan', () => {
  const block = sliceAfter('const [latestResult, todayResult] = await Promise.all(', 24);
  const matches = block.match(/parent_post_id/g) || [];
  assert.equal(matches.length, 2, 'kedua query teaser harus disaring, bukan salah satu');
});

test('hitung belum-dibaca menyaring segmen lanjutan', () => {
  assert.match(sliceAfter('let unreadQuery = supabase', 12), /parent_post_id/);
});

test('lookup kutipan TIDAK disaring', () => {
  const block = sliceAfter('const buildQuotedQuery = includeMedia =>', 12);
  assert.doesNotMatch(
    block,
    /parent_post_id/,
    'mengutip satu segmen utas itu sah — jangan disaring',
  );
});
