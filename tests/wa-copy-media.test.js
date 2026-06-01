import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  kindFromMime,
  extFromMime,
  validateMedia,
  safeBaseName,
  MAX_IMAGE_BYTES,
  MAX_DOC_BYTES,
} from '../lib/wa-copy-media.js';

test('kindFromMime maps images vs docs', () => {
  assert.equal(kindFromMime('image/png'), 'image');
  assert.equal(kindFromMime('image/webp'), 'image');
  assert.equal(kindFromMime('application/pdf'), 'file');
  assert.equal(kindFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'file');
});

test('extFromMime returns the expected extension', () => {
  assert.equal(extFromMime('image/jpeg'), 'jpg');
  assert.equal(extFromMime('image/png'), 'png');
  assert.equal(extFromMime('application/pdf'), 'pdf');
  assert.equal(extFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx');
  assert.equal(extFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
});

test('validateMedia accepts allowed types within size caps', () => {
  assert.equal(validateMedia({ mime: 'image/png', size: 1000 }), null);
  assert.equal(validateMedia({ mime: 'application/pdf', size: MAX_DOC_BYTES }), null);
  assert.equal(validateMedia({ mime: 'image/jpeg', size: MAX_IMAGE_BYTES }), null);
});

test('validateMedia rejects disallowed mime', () => {
  assert.match(validateMedia({ mime: 'image/gif', size: 1000 }), /Format tidak didukung/);
  assert.match(validateMedia({ mime: 'text/html', size: 1000 }), /Format tidak didukung/);
});

test('validateMedia rejects oversize by kind', () => {
  assert.match(validateMedia({ mime: 'image/png', size: MAX_IMAGE_BYTES + 1 }), /maksimal 6MB/);
  assert.match(validateMedia({ mime: 'application/pdf', size: MAX_DOC_BYTES + 1 }), /maksimal 10MB/);
});

test('validateMedia rejects empty/unreadable size', () => {
  assert.match(validateMedia({ mime: 'image/png', size: 0 }), /kosong/);
});

test('safeBaseName slugifies and drops the extension', () => {
  assert.equal(safeBaseName('My File (1).PDF'), 'my-file-1');
  assert.equal(safeBaseName('paspor jamaah.docx'), 'paspor-jamaah');
  assert.equal(safeBaseName(''), 'media');
  assert.equal(safeBaseName('...'), 'media');
});
