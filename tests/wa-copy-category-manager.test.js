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

test('hook exposes category CRUD wired to categoryOps with reassign-on-delete', () => {
  const hook = read('src/components/wa-copy/hooks/useWaCopyContent.ts');
  // imports
  assert.match(hook, /from '\.\.\/lib\/categoryOps'/);
  // create/update/reorder/delete for each kind
  for (const fn of [
    'createCaptionCategory', 'updateCaptionCategory', 'reorderCaptionCategory', 'deleteCaptionCategory',
    'createFaqCategory', 'updateFaqCategory', 'reorderFaqCategory', 'deleteFaqCategory',
    'createTourCategory', 'updateTourCategory', 'reorderTourCategory', 'deleteTourCategory',
  ]) {
    assert.match(hook, new RegExp(`function ${fn}\\b`), `missing ${fn}`);
    assert.match(hook, new RegExp(`${fn},`), `${fn} not returned`);
  }
  // delete reassigns content via the right field and bails on null
  assert.match(hook, /deleteCategoryAndReassign\(store\.captionCategories, store\.captions, 'category'/);
  assert.match(hook, /deleteCategoryAndReassign\(store\.faqCategories, store\.faqs, 'category'/);
  assert.match(hook, /deleteCategoryAndReassign\(store\.tourPhases, store\.tourSteps, 'phase'/);
  assert.match(hook, /if \(!res\) return;/);
});
