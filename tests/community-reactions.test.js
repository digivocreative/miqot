import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMUNITY_REACTIONS,
  COMMUNITY_REACTION_TYPES,
  emptyReactionCounts,
  sumReactions,
  topReactionEmojis,
} from '../lib/community-reactions.js';

test('registri memuat 7 reaksi terurut dengan kunci lama dipertahankan', () => {
  assert.equal(COMMUNITY_REACTIONS.length, 7);
  assert.deepEqual(
    COMMUNITY_REACTION_TYPES,
    ['suka', 'cinta', 'aamiin', 'selamat', 'senang', 'masyaallah', 'semangat'],
  );
  // kunci lama tetap ada (baris DB lama = subset)
  for (const k of ['suka', 'aamiin', 'selamat']) {
    assert.ok(COMMUNITY_REACTION_TYPES.includes(k));
  }
});

test('emptyReactionCounts menginisialisasi semua kunci ke 0', () => {
  const counts = emptyReactionCounts();
  assert.deepEqual(Object.keys(counts).sort(), [...COMMUNITY_REACTION_TYPES].sort());
  assert.ok(Object.values(counts).every(v => v === 0));
});

test('sumReactions menjumlah semua kunci dan tahan input null', () => {
  assert.equal(sumReactions({ suka: 5, cinta: 3, aamiin: 2, selamat: 0, senang: 1, masyaallah: 0, semangat: 0 }), 11);
  assert.equal(sumReactions(null), 0);
  assert.equal(sumReactions(undefined), 0);
});

test('topReactionEmojis urut desc jumlah, tie = urutan definisi, hormati limit', () => {
  const counts = { suka: 5, cinta: 3, aamiin: 2, selamat: 1, senang: 1, masyaallah: 0, semangat: 0 };
  assert.deepEqual(topReactionEmojis(counts, 3), ['👍', '❤️', '🤲']);
  // tie antara selamat(1) & senang(1): selamat lebih dulu didefinisikan
  assert.deepEqual(topReactionEmojis({ selamat: 1, senang: 1 }, 2), ['🎉', '😊']);
  assert.deepEqual(topReactionEmojis(emptyReactionCounts(), 3), []);
});
