import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseKontenPath } from '../src/components/wa-copy/lib/kontenRoutes.js';

const rootPath = new URL('..', import.meta.url).pathname;
const source = readFileSync(
  join(rootPath, 'src/components/wa-copy/admin/WaCopyAdminPage.tsx'),
  'utf8',
);

test('WA Copy admin content tabs put FAQ first and open on FAQ', () => {
  const faqIndex = source.indexOf("value: 'faq' as WaTab");
  const captionIndex = source.indexOf("value: 'caption' as WaTab");
  const tourLeaderIndex = source.indexOf("value: 'tourleader' as WaTab");

  assert.ok(faqIndex >= 0, 'FAQ tab option is missing');
  assert.ok(captionIndex >= 0, 'Caption tab option is missing');
  assert.ok(tourLeaderIndex >= 0, 'Tour Leader tab option is missing');
  assert.ok(faqIndex < captionIndex, 'FAQ tab should be left of Caption');
  assert.ok(captionIndex < tourLeaderIndex, 'Caption tab should stay left of Tour Leader');
  // The default tab is now URL-derived: the bare konten path opens the FAQ list.
  assert.deepEqual(parseKontenPath('/dashboard/konten').route, { kind: 'list', tab: 'faq' });
});

test('WA Copy admin content list does not render the helper copy under the tabs', () => {
  assert.doesNotMatch(source, /Kelola konten yang dilihat semua agent\./);
});
