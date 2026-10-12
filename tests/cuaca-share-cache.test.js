import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat, utimes, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildCuacaShareCacheKey,
  cleanupCuacaShareCache,
  getOrCreateCuacaShareImage,
} from '../lib/cuaca-share-cache.mjs';

const agent = { slug: 'bagas', name: 'Bagas Pramudita', phone: '0812', photo: 'https://sb.alhijaz.co/a.jpg' };
const SYNC = '2026-10-12T05:00:08Z';
const tempDir = () => mkdtemp(path.join(tmpdir(), 'cuaca-share-cache-'));

test('cache key changes with weather sync, agent photo, city and template', () => {
  const base = buildCuacaShareCacheKey({ cityKey: 'makkah', syncedAt: SYNC, agent, templateVersion: 't1' });
  assert.match(base, /^bagas-makkah-[a-f0-9]{16}\.jpg$/);
  assert.equal(buildCuacaShareCacheKey({ cityKey: 'makkah', syncedAt: SYNC, agent, templateVersion: 't1' }), base);
  for (const changed of [
    { cityKey: 'makkah', syncedAt: '2026-10-12T08:00:00Z', agent, templateVersion: 't1' },
    { cityKey: 'makkah', syncedAt: SYNC, agent: { ...agent, photo: 'https://sb.alhijaz.co/b.jpg' }, templateVersion: 't1' },
    { cityKey: 'madinah', syncedAt: SYNC, agent, templateVersion: 't1' },
    { cityKey: 'makkah', syncedAt: SYNC, agent, templateVersion: 't2' },
  ]) assert.notEqual(buildCuacaShareCacheKey(changed), base);
});

test('second request is a cache hit; concurrent requests share one render', async () => {
  const cacheDir = await tempDir();
  let calls = 0;
  const render = async () => { calls += 1; await new Promise(r => setTimeout(r, 20)); return Buffer.from(`img-${calls}`); };
  const args = { cityKey: 'makkah', syncedAt: SYNC, agent, dateKey: '20261012', render, cacheDir };
  const [a, b] = await Promise.all([getOrCreateCuacaShareImage(args), getOrCreateCuacaShareImage(args)]);
  assert.equal(calls, 1);
  assert.equal(a.buffer.toString(), 'img-1');
  assert.equal(b.buffer.toString(), 'img-1');
  const third = await getOrCreateCuacaShareImage(args);
  assert.equal(third.cacheHit, true);
  assert.equal(calls, 1);
  assert.deepEqual(await readdir(cacheDir), ['2026-10-12']);
});

test('empty render result is rejected and not cached', async () => {
  const cacheDir = await tempDir();
  await assert.rejects(
    getOrCreateCuacaShareImage({ cityKey: 'makkah', syncedAt: SYNC, agent, dateKey: '20261012', render: async () => Buffer.alloc(0), cacheDir }),
    /kosong/,
  );
});

test('cleanup deletes expired files then oldest files beyond the size cap', async () => {
  const cacheDir = await tempDir();
  const dir = path.join(cacheDir, '2026-10-10');
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  const files = [['old.jpg', 3 * 864e5, 10], ['mid.jpg', 3600e3, 10], ['new.jpg', 60e3, 10]];
  for (const [name, age, size] of files) {
    const p = path.join(dir, name);
    await writeFile(p, Buffer.alloc(size));
    await utimes(p, (now - age) / 1000, (now - age) / 1000);
  }
  const stats = await cleanupCuacaShareCache({ cacheDir, ttlMs: 2 * 864e5, maxBytes: 15, now });
  assert.equal(stats.deletedExpired, 1);
  assert.equal(stats.deletedForSize, 1);
  assert.deepEqual(await readdir(dir), ['new.jpg']);
  assert.ok((await stat(path.join(dir, 'new.jpg'))).isFile());
});
