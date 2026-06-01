import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('server registers admin-only wa-copy media route that uploads to Bunny', () => {
  const src = read('server.js');
  assert.match(src, /from '\.\/lib\/wa-copy-media\.js'/, 'server.js must import the media lib');
  const routeIdx = src.indexOf("app.post('/api/admin/wa-copy/media'");
  assert.ok(routeIdx >= 0, 'route path missing');
  const line = src.slice(routeIdx, routeIdx + 200);
  assert.match(line, /authMiddleware/, 'route must use authMiddleware');
  assert.match(line, /adminOnly/, 'route must use adminOnly');
  const handler = src.slice(routeIdx, routeIdx + 1400);
  assert.match(handler, /getBunnyEnabled\(\)/);
  assert.match(handler, /validateMedia\(/);
  assert.match(handler, /bunnyUpload\(/);
  assert.match(handler, /\$\{BUNNY_CDN_HOSTNAME\}/);
});

test('wa-copy media path gets a 16mb json parser registered before the global 10mb limit', () => {
  const src = read('server.js');
  const scoped = src.indexOf("app.use('/api/admin/wa-copy/media', express.json({ limit: '16mb' }))");
  const globalParser = src.indexOf("app.use(express.json({ limit: '10mb' }))");
  assert.ok(scoped >= 0, 'path-scoped 16mb parser missing');
  assert.ok(globalParser >= 0, 'global 10mb json parser missing');
  assert.ok(scoped < globalParser, 'scoped 16mb parser must be registered before the global 10mb parser');
});

test('types.ts defines MediaAttachment and adds media[] to the three entries', () => {
  const src = read('src/components/wa-copy/lib/types.ts');
  assert.match(src, /export interface MediaAttachment\s*{/);
  for (const field of ['url:', 'kind:', 'mime:', 'name:', 'size:']) {
    assert.ok(src.includes(field), `MediaAttachment missing ${field}`);
  }
  assert.match(src, /kind:\s*'image'\s*\|\s*'file'/);
  const count = (src.match(/media\?:\s*MediaAttachment\[\]/g) || []).length;
  assert.ok(count >= 3, `expected media?: MediaAttachment[] on 3 interfaces, found ${count}`);
});

test('FE media.ts mirrors the authoritative allowlist + caps (no drift)', () => {
  const lib = read('lib/wa-copy-media.js');
  const fe = read('src/components/wa-copy/lib/media.ts');
  const mimes = [
    'image/png', 'image/jpeg', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  for (const m of mimes) {
    assert.ok(lib.includes(m), `lib missing ${m}`);
    assert.ok(fe.includes(m), `FE media.ts missing ${m}`);
  }
  for (const cap of ['6 * 1024 * 1024', '10 * 1024 * 1024']) {
    assert.ok(fe.includes(cap), `FE media.ts missing cap ${cap}`);
  }
  assert.match(fe, /MEDIA_UPLOAD_URL\s*=\s*'\/api\/admin\/wa-copy\/media'/);
  assert.match(fe, /export function fileToBase64/);
  assert.match(fe, /export function validateMediaFile/);
});

test('MediaView renders image vs file and an optional download link', () => {
  const src = read('src/components/wa-copy/admin/MediaView.tsx');
  assert.match(src, /media\.kind === 'image'/);
  assert.match(src, /<img/);
  assert.match(src, /download=\{media\.name\}/);
  assert.match(src, /formatBytes\(media\.size\)/);
  assert.match(src, /download\s*=\s*true/);
});

test('MediaUploadField validates, uploads with auth headers, and reports back', () => {
  const src = read('src/components/wa-copy/admin/MediaUploadField.tsx');
  assert.match(src, /from '\.\.\/\.\.\/LoginPage'/);
  assert.match(src, /validateMediaFile\(/);
  assert.match(src, /fileToBase64\(/);
  assert.match(src, /fetch\(MEDIA_UPLOAD_URL/);
  assert.match(src, /getAuthHeaders\(\)/);
  assert.match(src, /onChange\(\{/);
  assert.match(src, /accept=\{ACCEPT_ATTR\}/);
  assert.match(src, /import MediaView from '\.\/MediaView'/);
});

test('all three editors render MediaUploadField and include media in the draft', () => {
  const files = [
    'src/components/wa-copy/admin/FaqEditor.tsx',
    'src/components/wa-copy/admin/CaptionEditor.tsx',
    'src/components/wa-copy/admin/TourLeaderEditor.tsx',
  ];
  for (const f of files) {
    const src = read(f);
    assert.match(src, /import MediaUploadField from '\.\/MediaUploadField'/, `${f} missing import`);
    assert.match(src, /<MediaUploadField value=\{media\} onChange=\{setMedia\} \/>/, `${f} missing field`);
    assert.match(src, /initial\?\.media\?\.\[0\] \?\? null/, `${f} missing media state init`);
    assert.match(src, /media: media \? \[media\] : \[\]/, `${f} missing media in draft`);
  }
});

test('all three consumer cards render MediaView from entry.media', () => {
  const files = [
    'src/components/wa-copy/tabs/faq/FaqAccordionItem.tsx',
    'src/components/wa-copy/tabs/caption/CaptionCard.tsx',
    'src/components/wa-copy/tabs/tourleader/TourStepCard.tsx',
  ];
  for (const f of files) {
    const src = read(f);
    assert.match(src, /import MediaView from '\.\.\/\.\.\/admin\/MediaView'/, `${f} missing import`);
    assert.match(src, /entry\.media\?\.\[0\]/, `${f} missing media guard`);
    assert.match(src, /<MediaView media=\{entry\.media\[0\]\} \/>/, `${f} missing MediaView`);
  }
});
