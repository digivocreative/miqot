import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRootPostId,
  buildAncestorChain,
  groupRepliesWithPreview,
} from '../lib/community-thread.js';

// Hash sederhana dan stabil per-string, dipakai untuk menurunkan default
// created_at agar unik per id (bukan per panjang id). Dua id yang kebetulan
// sepanjang sama sebelumnya jatuh ke created_at yang identik dan diam-diam
// menyembunyikan bug urutan (lihat catatan pada groupRepliesWithPreview).
// Tes yang benar-benar butuh urutan tertentu tetap wajib meng-override
// created_at secara eksplisit.
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

const reply = (id, parent, root, extra = {}) => ({
  id,
  parent_post_id: parent,
  root_post_id: root,
  body: `isi ${id}`,
  created_at: extra.created_at
    || `2026-07-20T10:00:00.${String(hashId(id) % 1000).padStart(3, '0')}Z`,
  deleted_at: extra.deleted_at || null,
  author: { name: `Agen ${id}`, slug: id, photo: null },
});

test('resolveRootPostId: membalas kiriman induk memakai id induk itu', () => {
  assert.equal(resolveRootPostId({ id: 'p1', root_post_id: null }), 'p1');
});

test('resolveRootPostId: membalas balasan mewarisi akar thread', () => {
  assert.equal(resolveRootPostId({ id: 'c1', root_post_id: 'p1' }), 'p1');
});

test('buildAncestorChain: kiriman induk tidak punya leluhur', () => {
  const rows = [reply('p1', null, null)];
  assert.deepEqual(buildAncestorChain(rows, 'p1'), []);
});

test('buildAncestorChain: thread tiga tingkat berurutan dari akar', () => {
  const rows = [reply('p1', null, null), reply('c1', 'p1', 'p1'), reply('g1', 'c1', 'p1')];
  const chain = buildAncestorChain(rows, 'g1');
  assert.deepEqual(chain.map(node => node.id), ['p1', 'c1']);
  assert.ok(chain.every(node => node.available === true));
});

test('buildAncestorChain: leluhur terhapus jadi placeholder, rantai tidak putus', () => {
  const rows = [
    reply('p1', null, null),
    reply('c1', 'p1', 'p1', { deleted_at: '2026-07-20T11:00:00Z' }),
    reply('g1', 'c1', 'p1'),
  ];
  const chain = buildAncestorChain(rows, 'g1');
  assert.equal(chain.length, 2);
  assert.equal(chain[0].available, true);
  assert.deepEqual(chain[1], { available: false });
});

test('buildAncestorChain: leluhur yang barisnya hilang juga jadi placeholder', () => {
  const rows = [reply('g1', 'c1', 'p1')];
  assert.deepEqual(buildAncestorChain(rows, 'g1'), [{ available: false }]);
});

test('groupRepliesWithPreview: balasan >2 memicu sisa hitungan', () => {
  const children = [reply('c1', 'p1', 'p1')];
  const grandchildren = [
    reply('g1', 'c1', 'p1', { created_at: '2026-07-20T10:00:01Z' }),
    reply('g2', 'c1', 'p1', { created_at: '2026-07-20T10:00:02Z' }),
    reply('g3', 'c1', 'p1', { created_at: '2026-07-20T10:00:03Z' }),
  ];
  const grouped = groupRepliesWithPreview(children, grandchildren, { previewLimit: 2 });
  const entry = grouped.get('c1');
  assert.equal(entry.reply_count, 3);
  assert.deepEqual(entry.preview_replies.map(row => row.id), ['g2', 'g3']);
});

test('groupRepliesWithPreview: balasan terhapus tidak dihitung', () => {
  const children = [reply('c1', 'p1', 'p1')];
  const grandchildren = [
    reply('g1', 'c1', 'p1'),
    reply('g2', 'c1', 'p1', { deleted_at: '2026-07-20T11:00:00Z' }),
  ];
  const grouped = groupRepliesWithPreview(children, grandchildren, { previewLimit: 2 });
  assert.equal(grouped.get('c1').reply_count, 1);
  assert.deepEqual(grouped.get('c1').preview_replies.map(row => row.id), ['g1']);
});

test('groupRepliesWithPreview: komentar tanpa balasan tetap punya entri kosong', () => {
  const grouped = groupRepliesWithPreview([reply('c1', 'p1', 'p1')], [], { previewLimit: 2 });
  assert.deepEqual(grouped.get('c1'), { reply_count: 0, preview_replies: [] });
});

test('groupRepliesWithPreview: cucu milik komentar lain diabaikan', () => {
  const grouped = groupRepliesWithPreview(
    [reply('c1', 'p1', 'p1')],
    [reply('gX', 'c9', 'p1')],
    { previewLimit: 2 },
  );
  assert.equal(grouped.get('c1').reply_count, 0);
});

test('groupRepliesWithPreview: created_at seri terurut deterministik lewat id (UUID acak, bukan waktu)', () => {
  const children = [reply('c1', 'p1', 'p1')];
  const tie = '2026-07-20T10:00:00.000Z';
  // Dua balasan lahir pada milidetik yang sama (skenario nyata: backfill
  // migrasi). Urutan masukan sengaja dibalik (id lebih besar duluan) untuk
  // membuktikan hasilnya tidak bergantung pada urutan array, hanya pada
  // localeCompare id.
  const grandchildren = [
    reply('bbbb', 'c1', 'p1', { created_at: tie }),
    reply('aaaa', 'c1', 'p1', { created_at: tie }),
  ];
  const grouped = groupRepliesWithPreview(children, grandchildren, { previewLimit: 2 });
  assert.deepEqual(grouped.get('c1').preview_replies.map(row => row.id), ['aaaa', 'bbbb']);
});

test('groupRepliesWithPreview: previewLimit 0 mengosongkan preview tapi reply_count tetap benar', () => {
  const children = [reply('c1', 'p1', 'p1')];
  const grandchildren = [
    reply('g1', 'c1', 'p1', { created_at: '2026-07-20T10:00:01Z' }),
    reply('g2', 'c1', 'p1', { created_at: '2026-07-20T10:00:02Z' }),
  ];
  const grouped = groupRepliesWithPreview(children, grandchildren, { previewLimit: 0 });
  const entry = grouped.get('c1');
  assert.equal(entry.reply_count, 2);
  assert.deepEqual(entry.preview_replies, []);
});

test('groupRepliesWithPreview: previewLimit negatif tidak crash dan tidak slice terbalik', () => {
  const children = [reply('c1', 'p1', 'p1')];
  const grandchildren = [
    reply('g1', 'c1', 'p1', { created_at: '2026-07-20T10:00:01Z' }),
    reply('g2', 'c1', 'p1', { created_at: '2026-07-20T10:00:02Z' }),
  ];
  const grouped = groupRepliesWithPreview(children, grandchildren, { previewLimit: -2 });
  const entry = grouped.get('c1');
  assert.equal(entry.reply_count, 2);
  assert.deepEqual(entry.preview_replies, []);
});

test('buildAncestorChain: rantai leluhur lebih dari tiga tingkat', () => {
  const rows = [
    reply('p1', null, null),
    reply('c1', 'p1', 'p1'),
    reply('g1', 'c1', 'p1'),
    reply('gg1', 'g1', 'p1'),
    reply('ggg1', 'gg1', 'p1'),
  ];
  const chain = buildAncestorChain(rows, 'ggg1');
  assert.deepEqual(chain.map(node => node.id), ['p1', 'c1', 'g1', 'gg1']);
  assert.ok(chain.every(node => node.available === true));
});

test('buildAncestorChain: dua leluhur terhapus berurutan tetap jadi placeholder tanpa memutus rantai', () => {
  const rows = [
    reply('p1', null, null),
    reply('c1', 'p1', 'p1', { deleted_at: '2026-07-20T11:00:00Z' }),
    reply('g1', 'c1', 'p1', { deleted_at: '2026-07-20T11:00:00Z' }),
    reply('gg1', 'g1', 'p1'),
  ];
  const chain = buildAncestorChain(rows, 'gg1');
  assert.equal(chain.length, 3);
  assert.equal(chain[0].available, true);
  assert.equal(chain[0].id, 'p1');
  assert.deepEqual(chain[1], { available: false });
  assert.deepEqual(chain[2], { available: false });
});

test('buildAncestorChain: guard anti-siklus berhenti pada data korup siklik, tidak melempar galat', () => {
  const rows = [
    reply('a', 'b', 'p1'),
    reply('b', 'a', 'p1'),
  ];
  const chain = buildAncestorChain(rows, 'a');
  assert.equal(chain.length, 1);
  assert.equal(chain[0].id, 'b');
});
