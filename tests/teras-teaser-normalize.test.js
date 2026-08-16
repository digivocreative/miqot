import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm', sourcemap: false });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const modulePromise = importTsModule('src/lib/terasTeaser.ts');

const post = (over = {}) => ({
  author: { name: 'Ibu Sari', photo: 'https://cdn/a.jpg' },
  body_snippet: 'Halo semua',
  mentions: [],
  created_at: '2026-08-16T03:00:00.000Z',
  thumb: null,
  ...over,
});

test('payload baru: latest_posts jadi posts, entri sampah disaring, dipotong 3', async () => {
  const { normalizeTeaserData } = await modulePromise;
  const data = normalizeTeaserData({
    latest: post(),
    latest_posts: [
      post({ thumb: 'https://cdn/x.jpg', mentions: [{ slug: 'bagas', name: 'Bagas P' }, { slug: 7 }] }),
      'sampah',
      post({ body_snippet: 'Kedua' }),
      post(), post(),
    ],
    today_count: 12,
    recent_avatars: [{ name: 'A', photo: null }],
    unread_count: 4,
  });
  assert.equal(data.posts.length, 3);
  assert.equal(data.posts[0].thumb, 'https://cdn/x.jpg');
  assert.deepEqual(data.posts[0].mentions, [{ slug: 'bagas', name: 'Bagas P', photo: null }]);
  assert.equal(data.posts[1].body_snippet, 'Kedua');
  assert.equal(data.today_count, 12);
  assert.equal(data.unread_count, 4);
});

test('payload server lama: fallback [latest], thumb null', async () => {
  const { normalizeTeaserData } = await modulePromise;
  const data = normalizeTeaserData({
    latest: post({ body_snippet: 'Dari server lama' }),
    today_count: 1,
    recent_avatars: [],
    unread_count: 0,
  });
  assert.equal(data.posts.length, 1);
  assert.equal(data.posts[0].body_snippet, 'Dari server lama');
  assert.equal(data.posts[0].thumb, null);
});

test('feed kosong dan angka aneh dijinakkan', async () => {
  const { normalizeTeaserData } = await modulePromise;
  const data = normalizeTeaserData({ latest: null, latest_posts: [], today_count: -3, unread_count: 'x' });
  assert.deepEqual(data.posts, []);
  assert.equal(data.today_count, 0);
  assert.equal(data.unread_count, 0);
  assert.deepEqual(data.recent_avatars, []);
});

test('root bukan objek → throw', async () => {
  const { normalizeTeaserData } = await modulePromise;
  assert.throws(() => normalizeTeaserData(null));
  assert.throws(() => normalizeTeaserData([]));
});
