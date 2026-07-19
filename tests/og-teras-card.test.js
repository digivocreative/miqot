import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateTerasPostOgPng } from '../lib/og-generator.mjs';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test('generateTerasPostOgPng renders a PNG for a plain post', async () => {
  const png = await generateTerasPostOgPng({
    authorName: 'Nikita Sari',
    authorSlug: 'nikita',
    body: 'Jamaah kloter 3 sudah sampai Madinah dengan selamat.',
    createdAt: '2026-07-18T08:00:00.000Z',
    reactionCount: 4,
    commentCount: 2,
  });
  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.subarray(0, 4).equals(PNG_MAGIC), 'output is a PNG');
});

// Regression guard: Pango raises a *fatal* error when it can't find a colour
// emoji face, which aborts the process rather than throwing. If the glyph
// sanitiser ever regresses, this test dies with the runner — which is exactly
// the signal we want, because in production it would take the server down.
test('generateTerasPostOgPng survives emoji in the body and author name', async () => {
  const png = await generateTerasPostOgPng({
    authorName: 'Nikita 🌟 Sari',
    authorSlug: 'nikita',
    body: 'Omelan yang bikin rindu ❤️ 🕋 alhamdulillah 👨‍👩‍👧 sampai 🇸🇦',
    createdAt: '2026-07-19T16:43:13.727736+00:00',
    hasMedia: true,
  });
  assert.ok(png.subarray(0, 4).equals(PNG_MAGIC), 'output is a PNG');
});

test('generateTerasPostOgPng falls back when the post has no text at all', async () => {
  const png = await generateTerasPostOgPng({
    authorName: null,
    authorSlug: null,
    body: '   ',
    createdAt: 'not-a-date',
    hasMedia: true,
    isSystem: true,
  });
  assert.ok(png.subarray(0, 4).equals(PNG_MAGIC), 'output is a PNG');
});
