import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const source = readFileSync(
  join(rootPath, 'src/components/wa-copy/admin/ContentList.tsx'),
  'utf8',
);

test('Konten list groups rows by category instead of repeating category badges inside every card', () => {
  assert.match(source, /const groups = rows\.reduce<ContentGroup\[\]>/);
  assert.match(source, /\{group\.badge\}/);
  assert.match(source, /group\.rows\.map\(row =>/);
  assert.doesNotMatch(source, /text-\[9px\][\s\S]*\{row\.badge\}/);
});

test('Konten list cards prioritize readable titles and secondary reorder controls', () => {
  assert.match(source, /line-clamp-2/);
  assert.doesNotMatch(source, /truncate \$\{row\.active/);
  assert.match(source, /text-gray-300 dark:text-slate-600/);
  assert.match(source, /disabled:opacity-20/);
});
