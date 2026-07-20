import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTerasDigestMessages } from '../lib/teras-telegram-digest.js';

const ORIGIN = 'https://app.test';

function owner(overrides = {}) {
  return {
    id: 'owner-1',
    chat_id: '12345',
    prefs: { teras_tg_comment: true, teras_tg_reaction: true },
    sent_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

function reaction(overrides = {}) {
  return {
    post_id: 'p1',
    created_at: '2026-07-20T10:00:00Z',
    owner_agent_id: 'owner-1',
    actor_agent_id: 'a1',
    actor_name: 'Rina',
    ...overrides,
  };
}

function comment(overrides = {}) {
  return {
    id: 'c1',
    post_id: 'p1',
    created_at: '2026-07-20T10:00:00Z',
    owner_agent_id: 'owner-1',
    actor_agent_id: 'a1',
    actor_name: 'Rina',
    ...overrides,
  };
}

test('15 reaksi pada satu kiriman jadi satu pesan', () => {
  const reactions = Array.from({ length: 15 }, (_, i) => reaction({
    actor_agent_id: `a${i}`,
    actor_name: `Agen ${i}`,
    created_at: `2026-07-20T10:${String(i).padStart(2, '0')}:00Z`,
  }));
  const messages = buildTerasDigestMessages({ comments: [], reactions, mentions: [], owners: [owner()], origin: ORIGIN });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'reaction');
  assert.match(messages[0].text, /14 lainnya/);
  assert.match(messages[0].text, /Agen 14/, 'aktor terbaru yang jadi wajah');
  assert.match(messages[0].text, /https:\/\/app\.test\/dashboard\/teras\/post\/p1/);
});

test('reaksi pada dua kiriman jadi dua pesan', () => {
  const messages = buildTerasDigestMessages({
    comments: [],
    reactions: [reaction(), reaction({ post_id: 'p2', actor_agent_id: 'a2' })],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.deepEqual(messages.map(m => m.post_id).sort(), ['p1', 'p2']);
});

test('komentar yang juga sebutan tidak dikirim ulang', () => {
  const messages = buildTerasDigestMessages({
    comments: [comment()],
    reactions: [],
    mentions: [{ comment_id: 'c1', mentioned_agent_id: 'owner-1' }],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.deepEqual(messages, []);
});

test('sebutan untuk orang lain tidak membatalkan komentar milik pemilik', () => {
  const messages = buildTerasDigestMessages({
    comments: [comment()],
    reactions: [],
    mentions: [{ comment_id: 'c1', mentioned_agent_id: 'orang-lain' }],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'comment');
});

test('baris lebih tua dari watermark diabaikan', () => {
  const messages = buildTerasDigestMessages({
    comments: [],
    reactions: [reaction({ created_at: '2026-07-19T23:00:00Z' })],
    mentions: [],
    owners: [owner({ sent_at: '2026-07-20T00:00:00Z' })],
    origin: ORIGIN,
  });
  assert.deepEqual(messages, []);
});

test('aksi dari diri sendiri tidak menghasilkan pesan', () => {
  const messages = buildTerasDigestMessages({
    comments: [comment({ actor_agent_id: 'owner-1' })],
    reactions: [reaction({ actor_agent_id: 'owner-1' })],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.deepEqual(messages, []);
});

test('saklar kanal yang mati membungkam jenisnya saja', () => {
  const messages = buildTerasDigestMessages({
    comments: [comment()],
    reactions: [reaction()],
    mentions: [],
    owners: [owner({ prefs: { teras_tg_comment: true, teras_tg_reaction: false } })],
    origin: ORIGIN,
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'comment');
});

test('pemilik tanpa chat_id dilewati', () => {
  const messages = buildTerasDigestMessages({
    comments: [],
    reactions: [reaction()],
    mentions: [],
    owners: [owner({ chat_id: null })],
    origin: ORIGIN,
  });
  assert.deepEqual(messages, []);
});

test('tiga balasan pada satu kiriman jadi satu pesan berjumlah', () => {
  const messages = buildTerasDigestMessages({
    comments: [
      comment({ id: 'c1', actor_agent_id: 'a1' }),
      comment({ id: 'c2', actor_agent_id: 'a2' }),
      comment({ id: 'c3', actor_agent_id: 'a3' }),
    ],
    reactions: [],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /3 balasan baru/);
});
