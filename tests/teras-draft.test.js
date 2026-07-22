import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  feedDraftKey,
  replyDraftKey,
  loadDraft,
  saveDraft,
  clearDraft,
  pruneReplyDrafts,
  TERAS_DRAFT_MAX_AGE_MS,
} from '../src/lib/terasDraft.ts';

const NOW = 1_753_142_400_000;

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    get length() { return map.size; },
    key: index => Array.from(map.keys())[index] ?? null,
    map,
  };
}

function payload(segments, savedAt = NOW) {
  return JSON.stringify({ v: 1, savedAt, segments });
}

test('kunci memuat slug lowercase', () => {
  assert.equal(feedDraftKey('Nila'), 'teras:draft:nila:feed');
  assert.equal(replyDraftKey('Nila', 'p1'), 'teras:draft:nila:reply:p1');
});

test('simpan lalu muat bulat-balik', () => {
  const storage = fakeStorage();
  saveDraft(storage, feedDraftKey('nila'), ['halo', 'segmen dua'], NOW);
  assert.deepEqual(loadDraft(storage, feedDraftKey('nila'), NOW), ['halo', 'segmen dua']);
});

test('semua segmen kosong = hapus kunci', () => {
  const storage = fakeStorage({ [feedDraftKey('nila')]: payload(['lama']) });
  saveDraft(storage, feedDraftKey('nila'), ['  ', ''], NOW);
  assert.equal(storage.map.size, 0);
});

test('draf lebih tua dari 7 hari dibuang saat dibaca', () => {
  const key = feedDraftKey('nila');
  const storage = fakeStorage({ [key]: payload(['basi'], NOW - TERAS_DRAFT_MAX_AGE_MS - 1) });
  assert.equal(loadDraft(storage, key, NOW), null);
  assert.equal(storage.map.size, 0);
});

test('tepat 7 hari masih hidup', () => {
  const key = feedDraftKey('nila');
  const storage = fakeStorage({ [key]: payload(['pas'], NOW - TERAS_DRAFT_MAX_AGE_MS) });
  assert.deepEqual(loadDraft(storage, key, NOW), ['pas']);
});

test('JSON korup / versi asing / bentuk salah dibuang senyap', () => {
  for (const raw of ['{buk', JSON.stringify({ v: 2, savedAt: NOW, segments: ['x'] }), JSON.stringify({ v: 1, savedAt: 'x', segments: ['x'] }), JSON.stringify({ v: 1, savedAt: NOW, segments: [1] }), 'null']) {
    const key = feedDraftKey('nila');
    const storage = fakeStorage({ [key]: raw });
    assert.equal(loadDraft(storage, key, NOW), null, raw);
    assert.equal(storage.map.size, 0, raw);
  }
});

test('clearDraft menghapus kunci', () => {
  const key = feedDraftKey('nila');
  const storage = fakeStorage({ [key]: payload(['x']) });
  clearDraft(storage, key);
  assert.equal(storage.map.size, 0);
});

test('storage yang melempar tidak meledak', () => {
  const bomb = {
    getItem: () => { throw new Error('quota'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('quota'); },
    get length() { return 0; },
    key: () => null,
  };
  assert.equal(loadDraft(bomb, 'k', NOW), null);
  saveDraft(bomb, 'k', ['x'], NOW);
  clearDraft(bomb, 'k');
  pruneReplyDrafts(bomb, 'nila', 20, NOW);
});

test('prune: sisakan max terbaru, buang yang basi, kunci feed tak tersentuh', () => {
  const storage = fakeStorage();
  storage.setItem(feedDraftKey('nila'), payload(['feed'], NOW - TERAS_DRAFT_MAX_AGE_MS * 2));
  for (let i = 0; i < 25; i += 1) {
    storage.setItem(replyDraftKey('nila', `p${i}`), payload([`teks ${i}`], NOW - i * 1000));
  }
  storage.setItem(replyDraftKey('nila', 'basi'), payload(['basi'], NOW - TERAS_DRAFT_MAX_AGE_MS - 1));
  storage.setItem(replyDraftKey('lain', 'p0'), payload(['punya agent lain'], NOW));
  pruneReplyDrafts(storage, 'nila', 20, NOW);
  assert.equal(loadDraft(storage, replyDraftKey('nila', 'p0'), NOW)?.[0], 'teks 0');
  assert.equal(loadDraft(storage, replyDraftKey('nila', 'p19'), NOW)?.[0], 'teks 19');
  assert.equal(storage.getItem(replyDraftKey('nila', 'p20')), null);
  assert.equal(storage.getItem(replyDraftKey('nila', 'basi')), null);
  assert.notEqual(storage.getItem(feedDraftKey('nila')), null, 'kunci feed di luar urusan prune');
  assert.notEqual(storage.getItem(replyDraftKey('lain', 'p0')), null, 'agent lain tak tersentuh');
});
