import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupReactionRows,
  mergeNotifications,
  countUnreadNotifications,
} from '../lib/community-notifications.js';

const actor = (name) => ({ name, photo: `https://cdn.test/${name}.jpg` });

test('groups reactions per post, newest actor wins, unique actors counted', () => {
  const grouped = groupReactionRows([
    { post_id: 'p1', agent_id: 'a1', created_at: '2026-07-19T10:00:00Z', actor: actor('Rina'), snippet: 'Post satu' },
    { post_id: 'p1', agent_id: 'a2', created_at: '2026-07-19T12:00:00Z', actor: actor('Budi'), snippet: 'Post satu' },
    { post_id: 'p1', agent_id: 'a2', created_at: '2026-07-19T11:00:00Z', actor: actor('Budi'), snippet: 'Post satu' },
    { post_id: 'p2', agent_id: 'a3', created_at: '2026-07-19T09:00:00Z', actor: actor('Sari'), snippet: 'Post dua' },
  ]);

  assert.equal(grouped.length, 2);
  const p1 = grouped.find(row => row.post_id === 'p1');
  assert.equal(p1.created_at, '2026-07-19T12:00:00Z');
  assert.equal(p1.actor.name, 'Budi', 'aktor terbaru yang ditampilkan');
  assert.equal(p1.actor_count, 2, 'agent yang sama tidak dihitung dua kali');
});

test('merges three sources, newest first, and flags unread against the watermark', () => {
  const items = mergeNotifications({
    mentions: [{ id: 'm1', post_id: 'p1', comment_id: null, created_at: '2026-07-19T08:00:00Z', actor: actor('Rina'), snippet: 'halo @bagas' }],
    comments: [{ id: 'c1', post_id: 'p2', created_at: '2026-07-19T12:00:00Z', actor: actor('Budi'), snippet: 'mantap' }],
    reactions: [{ post_id: 'p3', agent_id: 'a3', created_at: '2026-07-19T10:00:00Z', actor: actor('Sari'), snippet: 'Post tiga' }],
  }, '2026-07-19T09:00:00Z');

  assert.deepEqual(items.map(i => i.type), ['comment', 'reaction', 'mention']);
  assert.deepEqual(items.map(i => i.unread), [true, true, false]);
  assert.deepEqual(items.map(i => i.id), ['comment:c1', 'reaction:p3', 'mention:m1']);
  assert.equal(items[1].actor_count, 1);
});

test('treats every item as unread when the watermark is missing', () => {
  const items = mergeNotifications({
    mentions: [{ id: 'm1', post_id: 'p1', comment_id: 'k1', created_at: '2020-01-01T00:00:00Z', actor: actor('Rina'), snippet: 'lama' }],
    comments: [],
    reactions: [],
  }, null);

  assert.deepEqual(items.map(i => i.unread), [true]);
});

test('caps the merged list at the limit, keeping the newest', () => {
  const comments = Array.from({ length: 40 }, (_, i) => ({
    id: `c${i}`,
    post_id: 'p1',
    created_at: `2026-07-19T${String(i % 24).padStart(2, '0')}:00:00Z`,
    actor: actor('Budi'),
    snippet: `komentar ${i}`,
  }));

  const items = mergeNotifications({ mentions: [], comments, reactions: [] }, null, 30);
  assert.equal(items.length, 30);
  assert.equal(items[0].created_at, '2026-07-19T23:00:00Z');
});

test('counts unread with reactions grouped per post and caps at 99', () => {
  assert.equal(countUnreadNotifications({
    mentions: [{ id: 'm1' }],
    comments: [{ id: 'c1' }, { id: 'c2' }],
    reactions: [
      { post_id: 'p1', agent_id: 'a1', created_at: '2026-07-19T10:00:00Z', actor: actor('Rina'), snippet: 'x' },
      { post_id: 'p1', agent_id: 'a2', created_at: '2026-07-19T11:00:00Z', actor: actor('Budi'), snippet: 'x' },
    ],
  }), 4, '1 mention + 2 komentar + 1 post yang direaksi');

  const many = Array.from({ length: 150 }, (_, i) => ({ id: `c${i}` }));
  assert.equal(countUnreadNotifications({ mentions: [], comments: many, reactions: [] }), 99);
});

test('tolerates missing sources', () => {
  assert.deepEqual(mergeNotifications({}, null), []);
  assert.equal(countUnreadNotifications({}), 0);
});

test('treats items with undefined created_at as unread when watermark is missing', () => {
  const items = mergeNotifications({
    mentions: [{ id: 'm1', post_id: 'p1', created_at: undefined, actor: actor('Rina'), snippet: 's' }],
    comments: [],
    reactions: [],
  }, null);

  assert.deepEqual(items.map(i => i.unread), [true], 'item dengan created_at undefined harus unread saat seenAt null');
});
