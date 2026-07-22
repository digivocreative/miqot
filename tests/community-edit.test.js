import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommunityEdit, MAX_REPLY_BODY_CHARS } from '../lib/community-edit.js';

test('edit kiriman valid: trim dan kembalikan body', () => {
  const result = validateCommunityEdit({ nextBody: '  teks baru  ', previousBody: 'lama', isReply: false });
  assert.deepEqual(result, { ok: true, body: 'teks baru' });
});

test('batas kiriman 500 per codepoint (emoji = 1)', () => {
  const emoji500 = '😀'.repeat(500);
  assert.equal(validateCommunityEdit({ nextBody: emoji500, previousBody: 'x', isReply: false }).ok, true);
  const emoji501 = '😀'.repeat(501);
  assert.deepEqual(
    validateCommunityEdit({ nextBody: emoji501, previousBody: 'x', isReply: false }),
    { ok: false, error: 'Isi posting wajib 1–500 karakter' },
  );
});

test('batas komentar 300 per codepoint', () => {
  assert.equal(MAX_REPLY_BODY_CHARS, 300);
  assert.equal(validateCommunityEdit({ nextBody: 'a'.repeat(300), previousBody: 'x', isReply: true }).ok, true);
  assert.deepEqual(
    validateCommunityEdit({ nextBody: 'a'.repeat(301), previousBody: 'x', isReply: true }),
    { ok: false, error: 'Isi komentar wajib 1–300 karakter' },
  );
});

test('kosong / spasi saja / bukan string ditolak dengan pesan sesuai jenis', () => {
  assert.deepEqual(
    validateCommunityEdit({ nextBody: '   ', previousBody: 'x', isReply: false }),
    { ok: false, error: 'Isi posting wajib 1–500 karakter' },
  );
  assert.deepEqual(
    validateCommunityEdit({ nextBody: undefined, previousBody: 'x', isReply: true }),
    { ok: false, error: 'Isi komentar wajib 1–300 karakter' },
  );
  assert.deepEqual(
    validateCommunityEdit({ nextBody: 42, previousBody: 'x', isReply: false }),
    { ok: false, error: 'Isi posting wajib 1–500 karakter' },
  );
});

test('@semua baru ditolak', () => {
  assert.deepEqual(
    validateCommunityEdit({ nextBody: 'halo @semua', previousBody: 'halo', isReply: false }),
    { ok: false, error: 'Tidak bisa menambah @semua lewat edit' },
  );
});

test('@semua yang sudah ada boleh dipertahankan atau dihapus', () => {
  assert.equal(
    validateCommunityEdit({ nextBody: 'update @semua ya', previousBody: 'info @semua', isReply: false }).ok,
    true,
  );
  assert.equal(
    validateCommunityEdit({ nextBody: 'tanpa broadcast', previousBody: 'info @semua', isReply: false }).ok,
    true,
  );
});

test('previousBody bukan string dianggap tanpa @semua', () => {
  assert.deepEqual(
    validateCommunityEdit({ nextBody: 'hai @semua', previousBody: null, isReply: false }),
    { ok: false, error: 'Tidak bisa menambah @semua lewat edit' },
  );
});
