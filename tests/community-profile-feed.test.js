import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(rootPath, path), 'utf8');

function feedHandler(server) {
  const start = server.indexOf("app.get('/api/community/feed'");
  assert.ok(start > 0, 'handler feed harus ada');
  const end = server.indexOf("app.get('/api/community/posts/:id'", start);
  assert.ok(end > start, 'batas akhir handler feed harus ketemu');
  return server.slice(start, end);
}

test('feed menerima query agent dan memfilter per agent_id', () => {
  const handler = feedHandler(read('server.js'));
  assert.match(handler, /req\.query\.agent/);
  assert.match(handler, /loadCommunityMembers\(\)/);
  assert.match(handler, /\.eq\('agent_id', profileMember\.id\)/);
});

test('slug bukan anggota Teras dijawab 404 dengan pesan Indonesia', () => {
  const handler = feedHandler(read('server.js'));
  assert.match(handler, /res\.status\(404\)\.json\(\{ error: 'Agent tidak ditemukan di Teras' \}\)/);
});

test('feed tanpa query agent tetap memakai jalur lama (tanpa filter)', () => {
  const handler = feedHandler(read('server.js'));
  // Filter hanya dipasang ketika profileMember ada.
  assert.match(handler, /if \(profileMember\) \{\s*query = query\.eq\('agent_id', profileMember\.id\);/);
});

test('members mengembalikan phone untuk tombol WhatsApp', () => {
  const server = read('server.js');
  assert.match(server, /\.select\('id, slug, name, photo, phone, telegram_chat_id, notification_prefs'\)/);
  const start = server.indexOf("app.get('/api/community/members'");
  const handler = server.slice(start, start + 1200);
  assert.match(handler, /phone: m\.phone \|\| null/);
});
