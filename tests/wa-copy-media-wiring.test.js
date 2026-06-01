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
