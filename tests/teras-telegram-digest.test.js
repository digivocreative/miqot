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

test('dua pemilik dengan masing-masing kiriman terisolasi satu sama lain', () => {
  // Catatan: satu post_id yang sama dipakai oleh DUA owner_agent_id berbeda
  // tidak mungkin terjadi di data produksi (satu kiriman selalu punya tepat
  // satu pemilik). Kasus ini sengaja dibuat mustahil supaya benar-benar
  // menguji bahwa kunci pengelompokan di groupByOwnerAndPost menyertakan
  // owner.id, bukan cuma post_id — memagari kontrak "satu pesan per pemilik
  // per kiriman" dari refactor yang diam-diam menghapus owner.id dari kunci.
  // Kalau dua kiriman punya post_id berbeda (kasus nyata), pengelompokan
  // per post_id saja sudah cukup memisahkan pesan, jadi tesnya tidak akan
  // pernah gagal walau owner.id dihapus dari kunci — makanya post_id dibuat
  // sama di sini.
  const owner1 = owner({ id: 'owner-1', chat_id: '12345' });
  const owner2 = owner({ id: 'owner-2', chat_id: '67890' });
  const messages = buildTerasDigestMessages({
    comments: [],
    reactions: [
      reaction({ post_id: 'p1', owner_agent_id: 'owner-1', actor_agent_id: 'a1', actor_name: 'Rina' }),
      reaction({ post_id: 'p1', owner_agent_id: 'owner-2', actor_agent_id: 'a2', actor_name: 'Budi' }),
    ],
    mentions: [],
    owners: [owner1, owner2],
    origin: ORIGIN,
  });

  assert.equal(messages.length, 2, 'harus ada dua pesan terpisah walau post_id sama');

  const msg1 = messages.find(m => m.agent_id === 'owner-1');
  const msg2 = messages.find(m => m.agent_id === 'owner-2');

  assert.ok(msg1, 'harus ada pesan untuk owner-1');
  assert.ok(msg2, 'harus ada pesan untuk owner-2');

  assert.equal(msg1.chat_id, '12345', 'pesan owner-1 harus ke chat_id miliknya');
  assert.equal(msg1.post_id, 'p1');
  assert.match(msg1.text, /Rina/, 'pesan owner-1 harus sebutkan aktor Rina, bukan tercampur Budi');

  assert.equal(msg2.chat_id, '67890', 'pesan owner-2 harus ke chat_id miliknya');
  assert.equal(msg2.post_id, 'p1');
  assert.match(msg2.text, /Budi/, 'pesan owner-2 harus sebutkan aktor Budi, bukan tercampur Rina');
});

test('latest_at pada reaksi adalah timestamp terbaru dalam grup, bukan baris pertama atau terakhir diproses', () => {
  // Sengaja tidak berurutan secara kronologis: baris tertua duluan, baris
  // terbaru di TENGAH, baris terakhir yang diproses bukan yang terbaru.
  // Implementasi naif "baris terakhir menang" akan menghasilkan 10:03 (baris
  // terakhir dalam array), bukan 10:05 (baris terbaru sesungguhnya) — dan
  // implementasi naif "baris pertama menang" akan menghasilkan 10:01.
  const reactions = [
    reaction({ actor_agent_id: 'a1', actor_name: 'Rina', created_at: '2026-07-20T10:01:00Z' }),
    reaction({ actor_agent_id: 'a2', actor_name: 'Budi', created_at: '2026-07-20T10:05:00Z' }),
    reaction({ actor_agent_id: 'a3', actor_name: 'Citra', created_at: '2026-07-20T10:03:00Z' }),
  ];
  const messages = buildTerasDigestMessages({ comments: [], reactions, mentions: [], owners: [owner()], origin: ORIGIN });

  assert.equal(messages.length, 1);
  assert.equal(
    messages[0].latest_at,
    '2026-07-20T10:05:00Z',
    'latest_at harus timestamp terbaru dalam grup, bukan baris pertama (10:01) atau baris terakhir diproses (10:03)',
  );
});

test('latest_at pada komentar adalah timestamp terbaru dalam grup, bukan baris pertama atau terakhir diproses', () => {
  const comments = [
    comment({ id: 'c1', actor_agent_id: 'a1', created_at: '2026-07-20T10:02:00Z' }),
    comment({ id: 'c2', actor_agent_id: 'a2', created_at: '2026-07-20T10:07:00Z' }),
    comment({ id: 'c3', actor_agent_id: 'a3', created_at: '2026-07-20T10:04:00Z' }),
  ];
  const messages = buildTerasDigestMessages({ comments, reactions: [], mentions: [], owners: [owner()], origin: ORIGIN });

  assert.equal(messages.length, 1);
  assert.equal(
    messages[0].latest_at,
    '2026-07-20T10:07:00Z',
    'latest_at harus timestamp terbaru dalam grup, bukan baris pertama (10:02) atau baris terakhir diproses (10:04)',
  );
});

test('aktor yang sama muncul berkali-kali dihitung sebagai satu dalam N lainnya', () => {
  const reactions = [
    reaction({ post_id: 'p1', actor_agent_id: 'a1', actor_name: 'Rina', created_at: '2026-07-20T10:00:00Z' }),
    reaction({ post_id: 'p1', actor_agent_id: 'a1', actor_name: 'Rina', created_at: '2026-07-20T10:01:00Z' }),
    reaction({ post_id: 'p1', actor_agent_id: 'a2', actor_name: 'Budi', created_at: '2026-07-20T10:02:00Z' }),
    reaction({ post_id: 'p1', actor_agent_id: 'a3', actor_name: 'Citra', created_at: '2026-07-20T10:03:00Z' }),
  ];
  const messages = buildTerasDigestMessages({
    comments: [],
    reactions,
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'reaction');
  assert.match(messages[0].text, /dan 2 lainnya/, 'harus sebutkan 2 lainnya bukan 3, karena a1 hanya dihitung sekali');
});
