import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COMMUNITY_POLL_DURATION_MS,
  communityPollPayload,
  isCommunityPollClosed,
  normalizeCommunityPollInput,
} from '../lib/community-poll.js';

test('normalizeCommunityPollInput: tanpa poll -> null tanpa error', () => {
  assert.deepEqual(normalizeCommunityPollInput(undefined), { options: null, error: null });
  assert.deepEqual(normalizeCommunityPollInput(null), { options: null, error: null });
});

test('normalizeCommunityPollInput: bentuk rusak ditolak', () => {
  for (const raw of ['x', 42, [], { options: 'x' }, { options: null }]) {
    assert.equal(normalizeCommunityPollInput(raw).error, 'Format polling tidak valid', JSON.stringify(raw));
  }
});

test('normalizeCommunityPollInput: batas jumlah opsi 2-4', () => {
  assert.match(normalizeCommunityPollInput({ options: ['satu'] }).error, /2–4 opsi/);
  assert.match(normalizeCommunityPollInput({ options: ['a', 'b', 'c', 'd', 'e'] }).error, /2–4 opsi/);
  assert.equal(normalizeCommunityPollInput({ options: ['a', 'b', 'c', 'd'] }).error, null);
});

test('normalizeCommunityPollInput: trim, tolak kosong/kembar/kepanjangan', () => {
  assert.deepEqual(
    normalizeCommunityPollInput({ options: ['  Umroh Maret  ', 'Umroh April'] }).options,
    ['Umroh Maret', 'Umroh April'],
  );
  assert.match(normalizeCommunityPollInput({ options: ['a', '   '] }).error, /ke-2 .* kosong/);
  assert.match(normalizeCommunityPollInput({ options: ['Sama', ' sama '] }).error, /kembar/);
  assert.match(
    normalizeCommunityPollInput({ options: ['x'.repeat(61), 'b'] }).error,
    /maksimal 60 karakter/,
  );
});

test('isCommunityPollClosed: batas waktu & nilai rusak', () => {
  const now = new Date('2026-07-26T10:00:00.000Z');
  assert.equal(isCommunityPollClosed('2026-07-26T10:00:01.000Z', now), false);
  assert.equal(isCommunityPollClosed('2026-07-26T10:00:00.000Z', now), true);
  assert.equal(isCommunityPollClosed('2026-07-26T09:59:59.000Z', now), true);
  assert.equal(isCommunityPollClosed('bukan-tanggal', now), true);
  assert.equal(isCommunityPollClosed(undefined, now), true);
});

test('communityPollPayload: hitung suara per opsi + my_vote + total', () => {
  const now = new Date('2026-07-26T10:00:00.000Z');
  const poll = { options: ['A', 'B', 'C'], ends_at: '2026-07-27T00:00:00.000Z' };
  const votes = [
    { agent_id: 'me', option_index: 1 },
    { agent_id: 'x', option_index: 1 },
    { agent_id: 'y', option_index: 0 },
    // di luar rentang / rusak -> diabaikan, bukan lempar
    { agent_id: 'z', option_index: 9 },
    { agent_id: 'w', option_index: '1' },
  ];
  assert.deepEqual(communityPollPayload(poll, votes, 'me', now), {
    options: [
      { text: 'A', votes: 1 },
      { text: 'B', votes: 2 },
      { text: 'C', votes: 0 },
    ],
    total_votes: 3,
    my_vote: 1,
    ends_at: '2026-07-27T00:00:00.000Z',
    closed: false,
  });
});

test('communityPollPayload: baris tak layak render -> null', () => {
  const now = new Date('2026-07-26T10:00:00.000Z');
  assert.equal(communityPollPayload(null, [], 'me', now), null);
  assert.equal(communityPollPayload({ options: ['A'], ends_at: '2026-07-27T00:00:00.000Z' }, [], 'me', now), null);
  assert.equal(communityPollPayload({ options: 'rusak', ends_at: '2026-07-27T00:00:00.000Z' }, [], 'me', now), null);
  assert.equal(communityPollPayload({ options: ['A', 'B'] }, [], 'me', now), null);
});

test('communityPollPayload: polling lewat ends_at ditandai closed', () => {
  const now = new Date('2026-07-28T00:00:00.000Z');
  const payload = communityPollPayload(
    { options: ['A', 'B'], ends_at: '2026-07-27T00:00:00.000Z' },
    [],
    'me',
    now,
  );
  assert.equal(payload.closed, true);
});

test('durasi poll = 24 jam', () => {
  assert.equal(COMMUNITY_POLL_DURATION_MS, 24 * 60 * 60 * 1000);
});
