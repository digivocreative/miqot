import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;
const server = readFileSync(join(rootPath, 'server.js'), 'utf8');

test('core imports and calls classifyAwapiSyncOutcome', () => {
  assert.match(server, /import \{ classifyAwapiSyncOutcome \} from '\.\/lib\/awapi-sync-outcome\.js'/);
  assert.match(server, /classifyAwapiSyncOutcome\(\{ fetchErrors, upsertErrors, anyRowsFetched \}\)/);
});

test('the old unconditional partial-fetch throw is removed from server.js', () => {
  assert.doesNotMatch(server, /if \(fetchErrors > 0\) \{[\s\S]{0,120}throw new Error\(`API fetch incomplete/);
  assert.doesNotMatch(server, /if \(upsertErrors > 0\) \{[\s\S]{0,120}throw new Error\(`API upsert failed/);
});

test('notify + CAPI + cleanup are gated on the outcome (full only)', () => {
  assert.match(server, /if \(outcome\.shouldNotify\) \{\s*\n\s*queueJamaahSyncNotifications/);
  assert.match(server, /if \(outcome\.shouldCleanup &&/);
  assert.match(server, /if \(outcome\.shouldNotify\) \{[\s\S]{0,200}processCapiPurchases/);
});

test('last_jamaah_sync_at bump is gated on shouldBump (partial + full)', () => {
  assert.match(server, /if \(outcome\.shouldBump\) \{[\s\S]{0,200}last_jamaah_sync_at: now/);
});

test('core returns a partial flag', () => {
  assert.match(server, /partial: outcome\.kind === 'partial'/);
  assert.match(server, /ok: outcome\.kind === 'full'/);
});

test('hardfail still throws so the caller can fall back to legacy', () => {
  assert.match(server, /if \(outcome\.kind === 'hardfail'\) \{[\s\S]{0,160}throw new Error/);
});
