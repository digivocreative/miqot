import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunityTeaserPosts } from '../lib/community-teaser.js';

// Replika kontrak communityAuthorProfile di server.js (PostgREST kadang
// membungkus relasi jadi array).
const authorProfile = value => {
  const author = Array.isArray(value) ? value[0] : value;
  return { name: author?.name ?? null, slug: author?.slug ?? null, photo: author?.photo ?? null };
};

const members = new Map([
  ['bagas', { slug: 'bagas', name: 'Bagas P' }],
  ['nikita', { slug: 'nikita', name: 'Nikita' }],
]);

const row = (over = {}) => ({
  id: 'p1',
  body: 'Halo semua',
  photo_url: null,
  created_at: '2026-08-16T03:00:00.000Z',
  agent: { name: 'Ibu Sari', photo: 'https://cdn/a.jpg' },
  ...over,
});

test('memetakan maksimal limit kiriman dengan author, snippet, waktu, dan thumb', () => {
  const rows = [1, 2, 3, 4, 5].map(n => row({ id: `p${n}`, body: `Kiriman ${n}` }));
  const posts = buildCommunityTeaserPosts(rows, { authorProfile, memberBySlug: members });
  assert.equal(posts.length, 3);
  assert.deepEqual(posts[0], {
    author: { name: 'Ibu Sari', photo: 'https://cdn/a.jpg' },
    body_snippet: 'Kiriman 1',
    mentions: [],
    created_at: '2026-08-16T03:00:00.000Z',
    thumb: null,
  });
});

test('snippet dipotong 120 unicode-safe dan mention diresolusi terhadap snippet', () => {
  const emoji = '🕋'.repeat(130);
  const posts = buildCommunityTeaserPosts(
    [row({ body: emoji }), row({ body: 'Cek jadwal ya @bagas dan @tidakada' })],
    { authorProfile, memberBySlug: members },
  );
  assert.equal(Array.from(posts[0].body_snippet).length, 120);
  assert.deepEqual(posts[1].mentions, [{ slug: 'bagas', name: 'Bagas P' }]);
});

test('thumb dari photo_url (trim), null bila kosong', () => {
  const posts = buildCommunityTeaserPosts(
    [row({ photo_url: '  https://cdn/x.jpg  ' }), row({ photo_url: '   ' }), row({})],
    { authorProfile, memberBySlug: members },
  );
  assert.equal(posts[0].thumb, 'https://cdn/x.jpg');
  assert.equal(posts[1].thumb, null);
  assert.equal(posts[2].thumb, null);
});

test('agent array-wrapped dan input aneh tidak meledak', () => {
  const posts = buildCommunityTeaserPosts(
    [row({ agent: [{ name: 'Wrap', photo: null }] }), null, 'bukan-objek'],
    { authorProfile, memberBySlug: members },
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].author.name, 'Wrap');
  assert.deepEqual(buildCommunityTeaserPosts(undefined, { authorProfile, memberBySlug: members }), []);
});
