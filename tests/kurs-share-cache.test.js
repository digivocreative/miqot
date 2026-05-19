import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildKursShareCacheKey,
  cleanupKursShareCache,
  formatKursDateForShare,
  getOrCreateKursShareImage,
} from '../lib/kurs-share-cache.mjs';

const sampleKurs = { usd: 17730, updatedAt: 'Senin, 18 Mei 2026' };
const sampleAgent = {
  slug: 'selfiah',
  name: 'Selfiah Handayani',
  phone: '081234567890',
  photo: 'https://example.com/selfiah.jpg',
  website: 'alhijaztourtravel.co.id',
};

async function tempCacheDir() {
  return mkdtemp(path.join(tmpdir(), 'kurs-share-cache-'));
}

test('formatKursDateForShare converts Mandiri timestamp to display date', () => {
  assert.equal(
    formatKursDateForShare('18/05/26 09:15 WIB'),
    'Senin, 18 Mei 2026'
  );
  assert.equal(formatKursDateForShare('Senin, 18 Mei 2026'), 'Senin, 18 Mei 2026');
});

test('buildKursShareCacheKey changes when template or agent-facing data changes', () => {
  const base = buildKursShareCacheKey({
    kurs: sampleKurs,
    agent: sampleAgent,
    templateVersion: 'hero-usd-v1',
  });

  assert.match(base, /^selfiah-[a-f0-9]{16}\.jpg$/);

  const changedTemplate = buildKursShareCacheKey({
    kurs: sampleKurs,
    agent: sampleAgent,
    templateVersion: 'hero-usd-v2',
  });
  const changedWebsite = buildKursShareCacheKey({
    kurs: sampleKurs,
    agent: { ...sampleAgent, website: 'wa.me/6281234567890' },
    templateVersion: 'hero-usd-v1',
  });
  const changedPhoto = buildKursShareCacheKey({
    kurs: sampleKurs,
    agent: { ...sampleAgent, photo: 'https://example.com/new.jpg' },
    templateVersion: 'hero-usd-v1',
  });

  assert.notEqual(changedTemplate, base);
  assert.notEqual(changedWebsite, base);
  assert.notEqual(changedPhoto, base);
});

test('getOrCreateKursShareImage reuses cached image on second call', async () => {
  const cacheDir = await tempCacheDir();
  let calls = 0;
  const generator = async () => {
    calls += 1;
    return Buffer.from(`image-${calls}`);
  };

  const first = await getOrCreateKursShareImage({
    kurs: sampleKurs,
    agent: sampleAgent,
    cacheDir,
    generator,
    templateVersion: 'hero-usd-test',
  });
  const second = await getOrCreateKursShareImage({
    kurs: sampleKurs,
    agent: sampleAgent,
    cacheDir,
    generator,
    templateVersion: 'hero-usd-test',
  });

  assert.equal(calls, 1);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(first.path, second.path);
  assert.equal(second.buffer.toString(), 'image-1');
  assert.equal((await readFile(first.path)).toString(), 'image-1');
});

test('cleanupKursShareCache removes expired files and enforces maxBytes oldest-first', async () => {
  const cacheDir = await tempCacheDir();
  const oldFile = path.join(cacheDir, 'old.jpg');
  const newestFile = path.join(cacheDir, 'newest.jpg');
  const middleFile = path.join(cacheDir, 'middle.jpg');

  await writeFile(oldFile, Buffer.alloc(10, 1));
  await writeFile(middleFile, Buffer.alloc(10, 2));
  await writeFile(newestFile, Buffer.alloc(10, 3));

  const now = Date.now();
  await utimes(oldFile, new Date(now - 10_000), new Date(now - 10_000));
  await utimes(middleFile, new Date(now - 2_000), new Date(now - 2_000));
  await utimes(newestFile, new Date(now - 1_000), new Date(now - 1_000));

  const ttlStats = await cleanupKursShareCache({
    cacheDir,
    ttlMs: 5_000,
    now,
    maxBytes: 1_000,
  });
  assert.equal(ttlStats.deletedExpired, 1);
  await assert.rejects(() => stat(oldFile), /ENOENT/);

  const sizeStats = await cleanupKursShareCache({
    cacheDir,
    ttlMs: 60_000,
    now,
    maxBytes: 10,
  });
  assert.equal(sizeStats.deletedForSize, 1);
  await assert.rejects(() => stat(middleFile), /ENOENT/);
  assert.equal((await stat(newestFile)).size, 10);
});
