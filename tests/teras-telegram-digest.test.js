import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTerasDigestMessages,
  computeOwnerDigestWatermarks,
} from '../lib/teras-telegram-digest.js';

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
  // Tautan dipindah dari badan teks ke field `url` (dirakit jadi tombol inline
  // oleh pemanggil), jadi teks tak boleh lagi memuat URL telanjang.
  assert.equal(messages[0].url, 'https://app.test/dashboard/teras/post/p1');
  assert.doesNotMatch(messages[0].text, /https?:\/\//);
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

test('balasan yang juga sebutan tetap dikirim lewat digest saat kanal sebutan pemilik mati', () => {
  // Pemilik mematikan community_mentions (kanal sebutan instan) tapi menyalakan
  // teras_tg_comment (digest komentar). Baris mention TETAP tercatat di DB
  // terlepas dari preferensi, tapi push instannya tidak pernah dikirim karena
  // kanalnya mati. Kalau dropCommentsAlreadySentAsMentions membuang komentar
  // ini tanpa syarat (perilaku lama), balasan ini tidak sampai lewat kanal
  // manapun — bug yang diperbaiki di sini.
  const messages = buildTerasDigestMessages({
    comments: [comment()],
    reactions: [],
    mentions: [{ comment_id: 'c1', mentioned_agent_id: 'owner-1' }],
    owners: [owner({ prefs: { community_mentions: false, teras_tg_comment: true, teras_tg_reaction: true } })],
    origin: ORIGIN,
  });
  assert.equal(messages.length, 1, 'balasan harus tetap sampai lewat digest komentar');
  assert.equal(messages[0].type, 'comment');
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

test('kutipan balasan terbaru muncul sebagai blockquote expandable', () => {
  const messages = buildTerasDigestMessages({
    comments: [
      comment({ id: 'c1', actor_agent_id: 'a1', snippet: 'balasan lama', created_at: '2026-07-20T10:00:00Z' }),
      comment({ id: 'c2', actor_agent_id: 'a2', snippet: 'balasan paling baru', created_at: '2026-07-20T10:05:00Z' }),
    ],
    reactions: [],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.equal(messages.length, 1);
  // Isi balasan TERBARU yang dikutip, bukan yang lama.
  assert.match(messages[0].text, /<blockquote expandable>balasan paling baru<\/blockquote>/);
  assert.doesNotMatch(messages[0].text, /balasan lama/);
});

test('kutipan komentar di-escape HTML dan reaksi tidak berkutip', () => {
  const [commentMsg] = buildTerasDigestMessages({
    comments: [comment({ snippet: '<script>&"x"' })],
    reactions: [],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.match(commentMsg.text, /&lt;script&gt;&amp;"x"/);
  assert.doesNotMatch(commentMsg.text, /<script>/);

  const [reactionMsg] = buildTerasDigestMessages({
    comments: [],
    reactions: [reaction()],
    mentions: [],
    owners: [owner()],
    origin: ORIGIN,
  });
  assert.doesNotMatch(reactionMsg.text, /blockquote/);
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

test('watermark maju ke latest_at pesan yang berhasil terkirim', () => {
  const watermarks = computeOwnerDigestWatermarks([
    { agent_id: 'owner-1', latest_at: '2026-07-20T10:00:00.000Z', delivered: true },
  ], Infinity);
  assert.equal(watermarks.get('owner-1'), '2026-07-20T10:00:00.000Z');
});

test('pesan yang gagal tidak memajukan watermark sama sekali', () => {
  const watermarks = computeOwnerDigestWatermarks([
    { agent_id: 'owner-1', latest_at: '2026-07-20T10:00:00.000Z', delivered: false },
  ], Infinity);
  assert.equal(watermarks.has('owner-1'), false, 'tidak ada pesan berhasil untuk owner ini, tidak boleh ada watermark');
});

test('komentar gagal (T1) tidak boleh tertutup watermark oleh reaksi yang berhasil (T2 > T1) — bug asli', () => {
  // Skenario persis dari laporan: pesan komentar owner pada T1 gagal terkirim,
  // pesan reaksi owner yang sama pada T2 (lebih baru) berhasil. Implementasi
  // naif "watermark = max(latest_at pesan berhasil)" akan memajukan watermark
  // ke T2, menutup komentar T1 secara PERMANEN oleh cek `created_at <= sent_at`
  // di lib/teras-telegram-digest.js — komentar itu tidak pernah dicoba ulang.
  const T1 = '2026-07-20T10:00:00.000Z';
  const T2 = '2026-07-20T10:05:00.000Z';
  const watermarks = computeOwnerDigestWatermarks([
    { agent_id: 'owner-1', latest_at: T1, delivered: false }, // komentar gagal
    { agent_id: 'owner-1', latest_at: T2, delivered: true },  // reaksi berhasil
  ], Infinity);

  const watermark = watermarks.get('owner-1');
  assert.ok(watermark, 'reaksi yang berhasil tetap harus menghasilkan watermark');
  assert.ok(
    new Date(watermark).getTime() < new Date(T1).getTime(),
    `watermark (${watermark}) harus dijepit ke sebelum T1 (${T1}) supaya komentar yang gagal dicoba ulang, bukan maju ke T2`,
  );
});

test('dua owner terisolasi: kegagalan owner lain tidak menjepit watermark owner ini', () => {
  const watermarks = computeOwnerDigestWatermarks([
    { agent_id: 'owner-1', latest_at: '2026-07-20T10:00:00.000Z', delivered: false },
    { agent_id: 'owner-2', latest_at: '2026-07-20T10:05:00.000Z', delivered: true },
  ], Infinity);
  assert.equal(watermarks.get('owner-2'), '2026-07-20T10:05:00.000Z', 'owner-2 tidak boleh terkena plafon kegagalan owner-1');
});

test('watermark tetap dijepit ke plafon lintas-query truncation walau semua pesan berhasil', () => {
  const ceilingMs = new Date('2026-07-20T10:02:00.000Z').getTime();
  const watermarks = computeOwnerDigestWatermarks([
    { agent_id: 'owner-1', latest_at: '2026-07-20T10:05:00.000Z', delivered: true },
  ], ceilingMs);
  assert.equal(watermarks.get('owner-1'), new Date(ceilingMs).toISOString());
});
