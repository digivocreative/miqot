import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeSafeDeletions } from '../lib/sync-cleanup.js';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

test('umroh cleanup deletes stale same-name rows by jm_id identity', () => {
  const plan = computeSafeDeletions({
    listComplete: true,
    fetchedBookingIds: new Set(['AIW0029057']),
    successfulBookingIds: new Set(['AIW0029057']),
    successfulJamaahPerBooking: new Map([
      ['AIW0029057', new Set(['jm:jm-new'])],
    ]),
    existingRows: [
      { bookingId: 'AIW0029057', jamaahKey: 'jm:jm-old', jmId: 'JM-OLD', nama: 'PARJIMIN PADMO SUPARJO' },
      { bookingId: 'AIW0029057', jamaahKey: 'jm:jm-new', jmId: 'JM-NEW', nama: 'PARJIMIN PADMO SUPARJO' },
    ],
    maxDeletePercent: 1,
  });

  assert.equal(plan.decision, 'delete');
  assert.deepEqual(plan.toDelete.map(row => row.jmId), ['JM-OLD']);
});

test('server umroh cleanup uses jm_id keys and exact jm_id delete', () => {
  const server = readFileSync(join(rootPath, 'server.js'), 'utf8');

  assert.match(server, /function jamaahCleanupIdentityKey/);
  assert.match(server, /return `jm:\$\{jmId\}`/);
  assert.match(server, /const cleanupKey = jamaahCleanupIdentityKey\(norm\)/);
  assert.match(server, /const cleanupKey = jamaahCleanupIdentityKey\(item\)/);
  assert.match(server, /\.select\('id_umroh, jm_id, nama, hijriah_year'\)/);
  assert.match(server, /\.select\('id_umroh, jm_id, nama'\)/);
  assert.match(server, /jamaahKey: jamaahCleanupIdentityKey\(r\)/);
  assert.match(server, /jmId: r\.jm_id/);
  assert.match(server, /query = row\.jmId \? query\.eq\('jm_id', row\.jmId\) : query\.eq\('nama', row\.nama\)/);
});
