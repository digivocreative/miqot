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

test('CategoryManager wires the store, icons, counts, reorder, and reassign-delete', () => {
  const mgr = read('src/components/wa-copy/admin/CategoryManager.tsx');
  assert.match(mgr, /useWaCopyContent\(\)/);
  assert.match(mgr, /resolveCategoryIcon/);
  assert.match(mgr, /konten/);                 // per-category count label
  assert.match(mgr, /DeleteCategoryPanel/);    // delete delegates to reassign panel
  assert.match(mgr, /CategoryEditor/);         // create/edit delegates to the form
  assert.match(mgr, /navigateUp/);             // up-navigation instead of onExit
  assert.match(mgr, /kontenPath\(/);           // no hand-concatenated paths
});

test('konten views derive from the URL — no internal view state, no backRequest', () => {
  const mgr = read('src/components/wa-copy/admin/CategoryManager.tsx');
  const page = read('src/components/wa-copy/admin/WaCopyAdminPage.tsx');
  const layout = read('src/components/DashboardLayout.tsx');
  // The event-counter back mechanism is gone everywhere. It caused the 2026-06-04
  // "Kelola Kategori blink" (stale never-reset counter replayed by a mount effect);
  // with URL-derived views the whole bug class is structurally impossible.
  for (const [name, src] of [['CategoryManager', mgr], ['WaCopyAdminPage', page], ['DashboardLayout', layout]]) {
    assert.doesNotMatch(src, /backRequest/i, `${name} still references backRequest`);
  }
  assert.doesNotMatch(layout, /kontenEditorOpen/);
  // Views are pure functions of the parsed route.
  assert.match(page, /parsed\.canonical/);
  assert.match(page, /route\.kind === 'entry-edit'/);
  assert.doesNotMatch(page, /useState/, 'WaCopyAdminPage must not keep view state');
  assert.doesNotMatch(mgr, /useState<SubView>/);
  assert.match(layout, /parseKontenPath/);
  assert.match(layout, /kontenPushDepth/);
  // Sibling tab switches replace, not push.
  assert.match(page, /\{ replace: true \}/);
});

test('DeleteCategoryPanel reassigns to another category and blocks when none remain', () => {
  const panel = read('src/components/wa-copy/admin/DeleteCategoryPanel.tsx');
  assert.match(panel, /Pindahkan/);
  assert.match(panel, /others/);
  assert.match(panel, /onConfirm\(reassignTo\)/);
});
