import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('Dashboard header back closes the Konten editor before leaving Konten', () => {
  const dashboard = read('src/components/DashboardLayout.tsx');

  assert.match(dashboard, /const \[kontenEditorOpen, setKontenEditorOpen\] = useState\(false\)/);
  assert.match(dashboard, /const \[kontenBackRequest, setKontenBackRequest\] = useState\(0\)/);
  assert.match(dashboard, /if \(activeTab === 'konten' && kontenEditorOpen\) \{[\s\S]*setKontenBackRequest\(n => n \+ 1\);[\s\S]*return;[\s\S]*\}/);
  assert.match(dashboard, /<WaCopyAdminPage[\s\S]*backRequest=\{kontenBackRequest\}[\s\S]*onEditingChange=\{setKontenEditorOpen\}/);
});

test('WA Copy admin page reports edit state and handles parent back requests', () => {
  const admin = read('src/components/wa-copy/admin/WaCopyAdminPage.tsx');

  assert.match(admin, /interface WaCopyAdminPageProps \{[\s\S]*backRequest\?: number;[\s\S]*onEditingChange\?: \(editing: boolean\) => void;[\s\S]*\}/);
  assert.match(admin, /export default function WaCopyAdminPage\(\{ backRequest = 0, onEditingChange \}: WaCopyAdminPageProps\)/);
  assert.match(admin, /onEditingChange\?\.\(editing !== null \|\| managing\)/);
  assert.match(admin, /const \[managing, setManaging\] = useState\(false\)/);
  assert.match(admin, /<CategoryManager\s+kind=\{type\}\s+backRequest=\{backRequest\}\s+onExit=\{\(\) => setManaging\(false\)\}/);
  assert.match(admin, /Kelola Kategori/);
  assert.match(admin, /setEditing\(current => \(current \? null : current\)\)/);
});
