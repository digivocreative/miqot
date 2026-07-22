import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPinCommunityPost } from '../lib/community-pin.js';

test('kiriman induk hidup boleh dipin', () => {
  assert.deepEqual(
    canPinCommunityPost({ deleted_at: null, parent_post_id: null, is_reply: false }),
    { ok: true },
  );
});

test('kiriman terhapus ditolak', () => {
  assert.deepEqual(
    canPinCommunityPost({ deleted_at: '2026-07-22T00:00:00Z', parent_post_id: null, is_reply: false }),
    { ok: false, error: 'Kiriman tidak ditemukan' },
  );
});

test('balasan ditolak', () => {
  assert.deepEqual(
    canPinCommunityPost({ deleted_at: null, parent_post_id: 'p1', is_reply: true }),
    { ok: false, error: 'Balasan tidak bisa disematkan' },
  );
});

test('segmen lanjutan utas ditolak', () => {
  assert.deepEqual(
    canPinCommunityPost({ deleted_at: null, parent_post_id: 'p1', is_reply: false }),
    { ok: false, error: 'Hanya segmen pertama utas yang bisa disematkan' },
  );
});

test('pra-migrasi thread (kolom undefined) diperlakukan lolos', () => {
  assert.deepEqual(canPinCommunityPost({ deleted_at: null }), { ok: true });
});

test('urutan cek: deleted menang atas balasan', () => {
  assert.deepEqual(
    canPinCommunityPost({ deleted_at: '2026-07-22T00:00:00Z', parent_post_id: 'p1', is_reply: true }),
    { ok: false, error: 'Kiriman tidak ditemukan' },
  );
});
