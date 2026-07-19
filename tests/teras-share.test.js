import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TERAS_SHORT_CODE_LEN,
  terasShortCode,
  terasSharePath,
  terasShareUrl,
  isTerasShortCode,
  communityShortCodeBounds,
} from '../lib/teras-share.js';

const FULL_ID = '9fc969b0-2465-4ae0-bbba-56e606a84914';
const CODE = '9fc969b0';

test('terasShortCode is the first UUID group, lowercased', () => {
  assert.equal(terasShortCode(FULL_ID), CODE);
  assert.equal(terasShortCode(FULL_ID.toUpperCase()), CODE);
  assert.equal(CODE.length, TERAS_SHORT_CODE_LEN);
});

test('terasShortCode is safe for falsy input', () => {
  assert.equal(terasShortCode(null), '');
  assert.equal(terasShortCode(undefined), '');
  assert.equal(terasShortCode(''), '');
});

test('terasSharePath and terasShareUrl build a short /teras/<code> link', () => {
  assert.equal(terasSharePath(FULL_ID), '/teras/9fc969b0');
  assert.equal(terasShareUrl(FULL_ID, 'https://app.example.com'), 'https://app.example.com/teras/9fc969b0');
});

test('terasShareUrl trims a trailing slash on origin (no double slash)', () => {
  assert.equal(terasShareUrl(FULL_ID, 'https://app.example.com/'), 'https://app.example.com/teras/9fc969b0');
});

test('isTerasShortCode accepts only exactly 8 hex chars', () => {
  assert.equal(isTerasShortCode(CODE), true);
  assert.equal(isTerasShortCode('9FC969B0'), true);
  assert.equal(isTerasShortCode(FULL_ID), false, 'full UUID has dashes');
  assert.equal(isTerasShortCode('9fc969b'), false, 'too short');
  assert.equal(isTerasShortCode('9fc969b0a'), false, 'too long');
  assert.equal(isTerasShortCode('9fc969gz'), false, 'non-hex');
  assert.equal(isTerasShortCode(12345678), false, 'not a string');
});

test('communityShortCodeBounds brackets every UUID starting with the code', () => {
  const { lo, hi } = communityShortCodeBounds(CODE);
  assert.equal(lo, '9fc969b0-0000-0000-0000-000000000000');
  assert.equal(hi, '9fc969b0-ffff-ffff-ffff-ffffffffffff');
  // The real post id must sort within [lo, hi].
  assert.ok(lo <= FULL_ID && FULL_ID <= hi);
});
