import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('Dashboard header back steps up inside Konten before leaving Konten', () => {
  const dashboard = read('src/components/DashboardLayout.tsx');

  // Chevron: konten sub-views step up to the parent route instead of going home.
  assert.match(dashboard, /if \(activeTab === 'konten' && parseKontenPath\(window\.location\.pathname\)\.route\.kind !== 'list'\) \{[\s\S]*?kontenUp\(\);[\s\S]*?return;[\s\S]*?\}/);
  // "Up" = real back over tracked internal pushes, else replace to the parent path.
  assert.match(dashboard, /const kontenPushDepth = useRef\(0\)/);
  assert.match(dashboard, /if \(kontenPushDepth\.current > 0\) window\.history\.back\(\);[\s\S]*?else navigatePath\(parent, \{ replace: true \}\)/);
  // The page gets the parsed route and both navigation callbacks.
  assert.match(dashboard, /<WaCopyAdminPage[\s\S]*?parsed=\{parseKontenPath\(window\.location\.pathname\)\}[\s\S]*?navigate=\{navigatePath\}[\s\S]*?navigateUp=\{kontenUp\}/);
});

test('WA Copy admin page derives views from the route and navigates up on cancel/save', () => {
  const admin = read('src/components/wa-copy/admin/WaCopyAdminPage.tsx');

  assert.match(admin, /interface WaCopyAdminPageProps \{[\s\S]*?parsed: ParsedKontenPath;[\s\S]*?navigate: \(path: string, opts\?: \{ replace\?: boolean \}\) => void;[\s\S]*?navigateUp: \(\) => void;[\s\S]*?\}/);
  // Non-canonical URLs are replace-navigated to their canonical form.
  assert.match(admin, /if \(!parsed\.canonical\) navigate\(kontenPath\(parsed\.route\), \{ replace: true \}\)/);
  // Editors cancel up; saves toast then go up.
  assert.match(admin, /onCancel=\{navigateUp\}/);
  assert.match(admin, /const afterSave = \(\) => \{[\s\S]*?showToast\('Konten tersimpan'\);[\s\S]*?navigateUp\(\);[\s\S]*?\}/);
  // The category manager subtree gets the narrowed route + the same callbacks.
  assert.match(admin, /<CategoryManager route=\{route\} navigate=\{navigate\} navigateUp=\{navigateUp\} \/>/);
  assert.match(admin, /Kelola Kategori/);
});
