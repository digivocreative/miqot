import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(rootPath, p), 'utf8');

test('icon registry exposes options + a Tag-defaulting resolver and covers seed icons', () => {
  const icons = read('src/components/wa-copy/lib/categoryIcons.ts');
  assert.match(icons, /export const CATEGORY_ICON_OPTIONS/);
  assert.match(icons, /export function resolveCategoryIcon\(name: string\): ElementType/);
  assert.match(icons, /\?\? Tag/); // fallback
  for (const name of ['Heart', 'Hourglass', 'Wallet', 'Quote', 'ShieldCheck', 'Lightbulb',
    'HelpCircle', 'CreditCard', 'FileText', 'Plane', 'BedDouble', 'ListChecks', 'Compass', 'Home']) {
    assert.match(icons, new RegExp(`name: '${name}'`), `registry missing seed icon ${name}`);
  }
});
