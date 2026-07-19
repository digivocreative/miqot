import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCommunityMentions } from '../lib/community-mentions.js';

const MEMBERS = ['nikita', 'bagas', 'agent-lain'];

test('extracts a member mention at start of body', () => {
  assert.deepEqual(
    extractCommunityMentions('@bagas halo apa kabar', MEMBERS, null),
    ['bagas'],
  );
});

test('extracts a mention after whitespace, not mid-word', () => {
  assert.deepEqual(
    extractCommunityMentions('email saya bagas@bagas.com jangan tag', MEMBERS, null),
    [],
    'the @ inside an email is not a word-boundary mention',
  );
  assert.deepEqual(
    extractCommunityMentions('halo @nikita dan\n@bagas', MEMBERS, null),
    ['nikita', 'bagas'],
  );
});

test('is case-insensitive on input, canonicalizes to member slug', () => {
  assert.deepEqual(
    extractCommunityMentions('@BAGAS @Nikita', MEMBERS, null),
    ['bagas', 'nikita'],
  );
});

test('ignores trailing punctuation around the slug', () => {
  assert.deepEqual(
    extractCommunityMentions('makasih @bagas! dan (@nikita).', MEMBERS, null),
    ['bagas', 'nikita'],
  );
});

test('drops non-members and unknown slugs', () => {
  assert.deepEqual(
    extractCommunityMentions('@orangasing @bagas @tidakada', MEMBERS, null),
    ['bagas'],
  );
});

test('dedupes repeated mentions, preserving first-seen order', () => {
  assert.deepEqual(
    extractCommunityMentions('@bagas @nikita @bagas lagi', MEMBERS, null),
    ['bagas', 'nikita'],
  );
});

test('excludes the author slug (no self-notify) when provided', () => {
  assert.deepEqual(
    extractCommunityMentions('@bagas catat ini @nikita', MEMBERS, 'bagas'),
    ['nikita'],
  );
});

test('keeps self mention when authorSlug is null (rendering path)', () => {
  assert.deepEqual(
    extractCommunityMentions('@bagas nulis sendiri', MEMBERS, null),
    ['bagas'],
  );
});

test('caps at the limit (default 10)', () => {
  const many = Array.from({ length: 15 }, (_, i) => `m${i}`);
  const body = many.map(s => `@${s}`).join(' ');
  assert.equal(extractCommunityMentions(body, many, null).length, 10);
  assert.equal(extractCommunityMentions(body, many, null, 3).length, 3);
});

test('handles empty / non-string body safely', () => {
  assert.deepEqual(extractCommunityMentions('', MEMBERS, null), []);
  assert.deepEqual(extractCommunityMentions(null, MEMBERS, null), []);
  assert.deepEqual(extractCommunityMentions(undefined, MEMBERS, null), []);
});

test('accepts a Set of allowed slugs', () => {
  assert.deepEqual(
    extractCommunityMentions('@bagas @nikita', new Set(['bagas']), null),
    ['bagas'],
  );
});
