import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_THREAD_SEGMENTS,
  buildThreadChain,
  collectThreadMentions,
  normalizeThreadSegments,
} from '../lib/community-thread-compose.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

test('bentuk lama tanpa segments jadi utas satu segmen', () => {
  const { segments, error } = normalizeThreadSegments({
    body: '  Halo Teras  ',
    client_id: ID_A,
    media: [{ type: 'image', url: 'https://cdn.test/a.jpg' }],
  });
  assert.equal(error, null);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].body, 'Halo Teras', 'body di-trim');
  assert.equal(segments[0].clientId, ID_A);
  assert.deepEqual(segments[0].media, [{ type: 'image', url: 'https://cdn.test/a.jpg' }]);
});

test('bentuk lama tanpa client_id tetap sah', () => {
  const { segments, error } = normalizeThreadSegments({ body: 'Halo' });
  assert.equal(error, null);
  assert.equal(segments[0].clientId, null);
});

test('pesan galat bentuk lama tidak berubah', () => {
  assert.equal(
    normalizeThreadSegments({ body: '   ' }).error,
    'Isi posting wajib 1–500 karakter',
    'klien dan tes lama bergantung pada teks persis ini',
  );
  assert.equal(
    normalizeThreadSegments({ body: 'a'.repeat(501) }).error,
    'Isi posting wajib 1–500 karakter',
  );
});

test('segments[] berisi dua kiriman diterima', () => {
  const { segments, error } = normalizeThreadSegments({
    segments: [
      { client_id: ID_A, body: 'Ini konten pertama.' },
      { client_id: ID_B, body: 'Ini konten kedua.', media: [] },
    ],
  });
  assert.equal(error, null);
  assert.deepEqual(segments.map(s => s.body), ['Ini konten pertama.', 'Ini konten kedua.']);
  assert.deepEqual(segments.map(s => s.clientId), [ID_A, ID_B]);
});

test('utas lebih dari 5 segmen ditolak', () => {
  const segments = Array.from({ length: MAX_THREAD_SEGMENTS + 1 }, (_, i) => ({
    client_id: `${i}1111111-1111-4111-8111-111111111111`,
    body: `Segmen ${i}`,
  }));
  assert.equal(
    normalizeThreadSegments({ segments }).error,
    'Utas maksimal 5 kiriman',
  );
});

test('segments kosong ditolak', () => {
  assert.equal(
    normalizeThreadSegments({ segments: [] }).error,
    'Utas wajib berisi minimal 1 kiriman',
  );
});

test('galat panjang di utas menyebut nomor segmennya', () => {
  const { error } = normalizeThreadSegments({
    segments: [
      { client_id: ID_A, body: 'Oke' },
      { client_id: ID_B, body: '   ' },
    ],
  });
  assert.equal(error, 'Isi kiriman ke-2 wajib 1–500 karakter');
});

test('utas wajib punya client_id di tiap segmen', () => {
  const { error } = normalizeThreadSegments({
    segments: [{ body: 'Satu' }, { body: 'Dua' }],
  });
  assert.equal(
    error,
    'Setiap kiriman dalam utas wajib punya ID',
    'rantai parent_post_id harus diketahui sebelum insert pertama',
  );
});

test('client_id bukan UUID ditolak', () => {
  assert.equal(
    normalizeThreadSegments({ segments: [{ client_id: 'bukan-uuid', body: 'Satu' }, { client_id: ID_B, body: 'Dua' }] }).error,
    'ID kiriman tidak valid',
  );
});

test('client_id kembar dalam satu utas ditolak', () => {
  assert.equal(
    normalizeThreadSegments({ segments: [{ client_id: ID_A, body: 'Satu' }, { client_id: ID_A, body: 'Dua' }] }).error,
    'ID kiriman kembar dalam satu utas',
  );
});

test('quote atau link preview di segmen selain pertama ditolak', () => {
  const message = 'Kutipan dan pratinjau tautan hanya boleh di kiriman pertama';
  assert.equal(
    normalizeThreadSegments({ segments: [{ client_id: ID_A, body: 'Satu' }, { client_id: ID_B, body: 'Dua', quoted_post_id: ID_C }] }).error,
    message,
  );
  assert.equal(
    normalizeThreadSegments({ segments: [{ client_id: ID_A, body: 'Satu' }, { client_id: ID_B, body: 'Dua', link_preview: { url: 'https://a.test' } }] }).error,
    message,
  );
});

test('buildThreadChain merantai parent dan root', () => {
  const { segments } = normalizeThreadSegments({
    segments: [
      { client_id: ID_A, body: 'Satu' },
      { client_id: ID_B, body: 'Dua' },
      { client_id: ID_C, body: 'Tiga' },
    ],
  });
  const chain = buildThreadChain(segments);
  assert.deepEqual(
    chain.map(row => [row.clientId, row.parentPostId, row.rootPostId]),
    [
      [ID_A, null, null],
      [ID_B, ID_A, ID_A],
      [ID_C, ID_B, ID_A],
    ],
    'segmen 1 tak terbedakan dari kiriman biasa; root selalu segmen 1',
  );
});

test('buildThreadChain untuk satu segmen tidak memakai kolom utas', () => {
  const { segments } = normalizeThreadSegments({ body: 'Halo' });
  const [row] = buildThreadChain(segments);
  assert.equal(row.parentPostId, null);
  assert.equal(row.rootPostId, null);
});

test('mention yang sama di dua segmen jadi satu, menunjuk segmen pertama', () => {
  const mentions = collectThreadMentions(
    [
      { postId: ID_A, body: 'halo @budi' },
      { postId: ID_B, body: 'sekali lagi @budi dan @siti' },
    ],
    ['budi', 'siti'],
    'nikita',
    10,
  );
  assert.deepEqual(mentions, [
    { slug: 'budi', postId: ID_A },
    { slug: 'siti', postId: ID_B },
  ]);
});

test('batas mention dihitung untuk seluruh utas, bukan per segmen', () => {
  const mentions = collectThreadMentions(
    [
      { postId: ID_A, body: '@a @b' },
      { postId: ID_B, body: '@c @d' },
    ],
    ['a', 'b', 'c', 'd'],
    'nikita',
    3,
  );
  assert.deepEqual(
    mentions.map(m => m.slug),
    ['a', 'b', 'c'],
    'utas 5 segmen tidak boleh jadi jalan pintas menyebut 5x lipat orang',
  );
});

test('penulis tidak menyebut dirinya sendiri', () => {
  const mentions = collectThreadMentions(
    [{ postId: ID_A, body: 'catatan untuk @nikita' }],
    ['nikita', 'budi'],
    'nikita',
    10,
  );
  assert.deepEqual(mentions, []);
});

test('iterator single-use (Map.keys) diterima di seluruh segmen utas', () => {
  const bySlug = new Map([['budi', 1], ['siti', 2]]);
  const mentions = collectThreadMentions(
    [
      { postId: ID_A, body: 'halo @budi' },
      { postId: ID_B, body: 'halo @siti' },
    ],
    bySlug.keys(),
    'nikita',
    10,
  );
  assert.deepEqual(
    mentions,
    [
      { slug: 'budi', postId: ID_A },
      { slug: 'siti', postId: ID_B },
    ],
    'iterator exhausted pada segmen 1 akan mencegah mention segmen 2+ ditemukan; ' +
    'memberSlugs harus di-materialize menjadi Set sebelum loop agar tetap iterabel',
  );
});
