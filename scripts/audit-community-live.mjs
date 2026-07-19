import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const baseUrl = String(process.env.COMMUNITY_AUDIT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

assert.equal(
  process.env.COMMUNITY_AUDIT_ALLOW_WRITES,
  '1',
  'Set COMMUNITY_AUDIT_ALLOW_WRITES=1 untuk mengizinkan fixture sementara dan cleanup audit',
);
assert.ok(supabaseUrl, 'SUPABASE_URL wajib tersedia');
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY wajib tersedia');
assert.ok(jwtSecret, 'JWT_SECRET wajib tersedia');

const supabase = createClient(supabaseUrl, serviceRoleKey);
const auditId = `teras-audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const createdPostIds = new Set();
const createdCommentIds = new Set();
const checks = [];

function pass(label) {
  checks.push(label);
  console.log(`PASS ${label}`);
}

async function api(path, { token, method = 'GET', body, expected = 200 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${method} ${path} membalas non-JSON (${response.status}): ${raw.slice(0, 160)}`);
  }
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(payload)}`);
  return payload;
}

async function requireRows(query, label) {
  const { data, error } = await query;
  assert.ifError(error);
  assert.ok(Array.isArray(data) && data.length > 0, label);
  return data;
}

async function cleanup() {
  const postIds = [...createdPostIds];
  const commentIds = [...createdCommentIds];

  if (commentIds.length > 0) {
    const { error } = await supabase.from('community_post_comments').delete().in('id', commentIds);
    if (error) console.error(`Cleanup komentar gagal: ${error.message}`);
  }
  if (postIds.length > 0) {
    for (const table of ['community_post_reports', 'community_post_reactions', 'community_post_comments']) {
      const { error } = await supabase.from(table).delete().in('post_id', postIds);
      if (error) console.error(`Cleanup ${table} gagal: ${error.message}`);
    }
    const { error } = await supabase.from('community_posts').delete().in('id', postIds);
    if (error) console.error(`Cleanup post gagal: ${error.message}`);
  }
}

try {
  const nikitaRows = await requireRows(
    supabase.from('agents').select('id, slug, name, role').eq('slug', 'nikita').limit(1),
    'Agent nikita tidak ditemukan',
  );
  const otherRows = await requireRows(
    supabase.from('agents').select('id, slug, name, role').neq('slug', 'nikita').limit(1),
    'Agent pembanding tidak ditemukan',
  );
  const nikita = nikitaRows[0];
  const other = otherRows[0];
  const nikitaToken = jwt.sign(
    { id: nikita.id, slug: nikita.slug, name: nikita.name, role: nikita.role || 'agent' },
    jwtSecret,
    { expiresIn: '10m' },
  );
  const otherToken = jwt.sign(
    { id: other.id, slug: other.slug, name: other.name, role: other.role || 'agent' },
    jwtSecret,
    { expiresIn: '10m' },
  );

  await api('/api/community/feed', { expected: 401 });
  pass('feed menolak request tanpa token');
  await api('/api/community/feed', { token: otherToken, expected: 403 });
  const gatedId = crypto.randomUUID();
  await api('/api/community/posts', { token: otherToken, method: 'POST', body: { body: 'Ditolak gate' }, expected: 403 });
  await api(`/api/community/posts/${gatedId}/reaction`, { token: otherToken, method: 'POST', body: { reaction: 'suka' }, expected: 403 });
  await api(`/api/community/posts/${gatedId}/comments`, { token: otherToken, expected: 403 });
  await api(`/api/community/posts/${gatedId}/comments`, { token: otherToken, method: 'POST', body: { body: 'Ditolak gate' }, expected: 403 });
  await api(`/api/community/posts/${gatedId}`, { token: otherToken, method: 'DELETE', expected: 403 });
  await api(`/api/community/comments/${gatedId}`, { token: otherToken, method: 'DELETE', expected: 403 });
  await api(`/api/community/posts/${gatedId}/report`, { token: otherToken, method: 'POST', expected: 403 });
  pass('gate menolak agent selain Nikita pada seluruh 9 route');
  await api('/api/community/feed?before=bukan-timestamp', { token: nikitaToken, expected: 400 });
  pass('cursor feed invalid ditolak');

  const textClientId = crypto.randomUUID();
  const textPostBody = { body: `Post teks ${auditId}`, client_id: textClientId, is_system: true, pinned_at: new Date().toISOString() };
  const created = await api('/api/community/posts', {
    token: nikitaToken,
    method: 'POST',
    body: textPostBody,
    expected: 201,
  });
  const textPost = created.data;
  assert.ok(textPost?.id);
  createdPostIds.add(textPost.id);
  assert.equal(textPost.body, `Post teks ${auditId}`);
  assert.equal(textPost.is_system, false);
  assert.equal(textPost.is_own, true);
  assert.deepEqual(textPost.reactions, { suka: 0, selamat: 0, aamiin: 0 });
  const createdRetry = await api('/api/community/posts', {
    token: nikitaToken,
    method: 'POST',
    body: textPostBody,
    expected: 201,
  });
  assert.equal(createdRetry.data.id, textPost.id);
  pass('buat/retry post teks idempoten, mengabaikan field sistem, dan mengembalikan shape feed');

  await api('/api/community/posts', { token: nikitaToken, method: 'POST', body: { body: ' ' }, expected: 400 });
  await api('/api/community/posts', {
    token: nikitaToken,
    method: 'POST',
    body: { body: 'ID invalid', client_id: 'invalid' },
    expected: 400,
  });
  await api('/api/community/posts', { token: nikitaToken, method: 'POST', body: { body: 'x'.repeat(2001) }, expected: 400 });
  await api('/api/community/posts', {
    token: nikitaToken,
    method: 'POST',
    body: { body: 'URL invalid', photo_url: 'https://example.com/foto.jpg' },
    expected: 400,
  });
  pass('validasi body dan URL foto post aktif');

  let feed = await api('/api/community/feed', { token: nikitaToken });
  let feedPost = feed.data.find(post => post.id === textPost.id);
  assert.ok(feedPost);
  assert.equal(feedPost.my_reaction, null);
  assert.equal(feedPost.comment_count, 0);
  pass('feed memuat post baru dengan agregat awal');

  await api(`/api/community/posts/${textPost.id}/reaction`, {
    token: nikitaToken,
    method: 'POST',
    body: { reaction: 'suka' },
  });
  feed = await api('/api/community/feed', { token: nikitaToken });
  feedPost = feed.data.find(post => post.id === textPost.id);
  assert.equal(feedPost.my_reaction, 'suka');
  assert.deepEqual(feedPost.reactions, { suka: 1, selamat: 0, aamiin: 0 });

  await api(`/api/community/posts/${textPost.id}/reaction`, {
    token: nikitaToken,
    method: 'POST',
    body: { reaction: 'selamat' },
  });
  feed = await api('/api/community/feed', { token: nikitaToken });
  feedPost = feed.data.find(post => post.id === textPost.id);
  assert.equal(feedPost.my_reaction, 'selamat');
  assert.deepEqual(feedPost.reactions, { suka: 0, selamat: 1, aamiin: 0 });

  await Promise.all([
    api(`/api/community/posts/${textPost.id}/reaction`, {
      token: nikitaToken,
      method: 'POST',
      body: { reaction: 'suka' },
    }),
    api(`/api/community/posts/${textPost.id}/reaction`, {
      token: nikitaToken,
      method: 'POST',
      body: { reaction: 'aamiin' },
    }),
  ]);
  const { data: concurrentReactions, error: concurrentReactionError } = await supabase
    .from('community_post_reactions')
    .select('reaction')
    .eq('post_id', textPost.id)
    .eq('agent_id', nikita.id);
  assert.ifError(concurrentReactionError);
  assert.equal(concurrentReactions.length, 1);
  assert.ok(['suka', 'aamiin'].includes(concurrentReactions[0].reaction));

  await api(`/api/community/posts/${textPost.id}/reaction`, {
    token: nikitaToken,
    method: 'POST',
    body: { reaction: null },
  });
  feed = await api('/api/community/feed', { token: nikitaToken });
  feedPost = feed.data.find(post => post.id === textPost.id);
  assert.equal(feedPost.my_reaction, null);
  assert.deepEqual(feedPost.reactions, { suka: 0, selamat: 0, aamiin: 0 });
  await api(`/api/community/posts/${textPost.id}/reaction`, {
    token: nikitaToken,
    method: 'POST',
    body: { reaction: 'invalid' },
    expected: 400,
  });
  pass('reaksi suka, ganti, concurrency, hapus, dan validasi berjalan satu-per-agent');

  let comments = await api(`/api/community/posts/${textPost.id}/comments`, { token: nikitaToken });
  assert.deepEqual(comments.data, []);
  const commentClientId = crypto.randomUUID();
  const commentBody = { body: `Komentar ${auditId}`, client_id: commentClientId };
  const commentResult = await api(`/api/community/posts/${textPost.id}/comments`, {
    token: nikitaToken,
    method: 'POST',
    body: commentBody,
    expected: 201,
  });
  const comment = commentResult.data;
  createdCommentIds.add(comment.id);
  assert.equal(comment.is_own, true);
  const commentRetry = await api(`/api/community/posts/${textPost.id}/comments`, {
    token: nikitaToken,
    method: 'POST',
    body: commentBody,
    expected: 201,
  });
  assert.equal(commentRetry.data.id, comment.id);
  comments = await api(`/api/community/posts/${textPost.id}/comments`, { token: nikitaToken });
  assert.equal(comments.data.length, 1);
  assert.equal(comments.data[0].id, comment.id);
  feed = await api('/api/community/feed', { token: nikitaToken });
  assert.equal(feed.data.find(post => post.id === textPost.id).comment_count, 1);
  await api(`/api/community/posts/${textPost.id}/comments`, {
    token: nikitaToken,
    method: 'POST',
    body: { body: ' ' },
    expected: 400,
  });
  await api(`/api/community/posts/${textPost.id}/comments`, {
    token: nikitaToken,
    method: 'POST',
    body: { body: 'x'.repeat(1001) },
    expected: 400,
  });
  await api(`/api/community/comments/${comment.id}`, { token: nikitaToken, method: 'DELETE' });
  await api(`/api/community/comments/${comment.id}`, { token: nikitaToken, method: 'DELETE' });
  pass('komentar load, buat/retry idempoten, count, validasi, dan soft-delete idempoten berjalan');

  const sharedFixtureTimestamp = new Date(Date.now() - 10_000).toISOString();
  const fixtureRows = Array.from({ length: 23 }, (_, index) => ({
    agent_id: other.id,
    body: `${auditId} fixture ${String(index).padStart(2, '0')}`,
    is_system: index === 0,
    created_at: sharedFixtureTimestamp,
  }));
  let { data: fixtures, error: fixtureError } = await supabase
    .from('community_posts')
    .insert(fixtureRows)
    .select('id, body, is_system, created_at');
  if (fixtureError?.code === '23502' && /column "type"/i.test(fixtureError.message || '')) {
    ({ data: fixtures, error: fixtureError } = await supabase
      .from('community_posts')
      .insert(fixtureRows.map(row => ({ ...row, type: row.is_system ? 'sorotan' : 'tips' })))
      .select('id, body, is_system, created_at'));
  }
  assert.ifError(fixtureError);
  for (const fixture of fixtures) createdPostIds.add(fixture.id);

  const firstPage = await api('/api/community/feed', { token: nikitaToken });
  assert.equal(firstPage.data.length, 20);
  assert.ok(firstPage.next_cursor);
  const secondPage = await api(`/api/community/feed?before=${encodeURIComponent(firstPage.next_cursor)}`, { token: nikitaToken });
  const allPageIds = new Set([...firstPage.data, ...secondPage.data].map(post => post.id));
  for (const fixture of fixtures) assert.ok(allPageIds.has(fixture.id), `Fixture pagination hilang: ${fixture.id}`);
  const systemFixture = firstPage.data.concat(secondPage.data).find(post => post.is_system && post.body.startsWith(auditId));
  assert.ok(systemFixture);
  assert.equal(systemFixture.is_own, false);
  pass('pagination komposit tidak melewatkan timestamp kembar, post agent lain, atau Sorotan');

  await api(`/api/community/posts/${systemFixture.id}/report`, { token: nikitaToken, method: 'POST' });
  await api(`/api/community/posts/${systemFixture.id}/report`, { token: nikitaToken, method: 'POST' });
  const { count: reportCount, error: reportError } = await supabase
    .from('community_post_reports')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', systemFixture.id)
    .eq('agent_id', nikita.id);
  assert.ifError(reportError);
  assert.equal(reportCount, 1);
  pass('laporan post idempoten');

  await api(`/api/community/posts/${systemFixture.id}`, { token: nikitaToken, method: 'DELETE' });
  await api(`/api/community/posts/${systemFixture.id}`, { token: nikitaToken, method: 'DELETE' });
  await api(`/api/community/posts/${textPost.id}`, { token: nikitaToken, method: 'DELETE' });
  await api(`/api/community/posts/${textPost.id}`, { token: nikitaToken, method: 'DELETE' });
  feed = await api('/api/community/feed', { token: nikitaToken });
  assert.ok(!feed.data.some(post => post.id === systemFixture.id || post.id === textPost.id));
  await api(`/api/community/posts/${textPost.id}/reaction`, {
    token: nikitaToken,
    method: 'POST',
    body: { reaction: 'suka' },
    expected: 404,
  });
  pass('hapus post admin/pemilik bersifat soft-delete dan post terhapus tak dapat dimutasi');

  console.log(`AUDIT OK ${checks.length} kelompok fitur lulus`);
} finally {
  await cleanup();
}
