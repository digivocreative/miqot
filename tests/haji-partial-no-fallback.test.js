import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const server = readFileSync(join(root.pathname, 'server.js'), 'utf8');

// Scope assertions to the haji core slice — the generic outcome.* patterns also
// appear in the umroh core (syncUmrahViaApiCore), which sits BEFORE this one.
const hajiStart = server.indexOf('async function syncHajiViaApiCore');
const endMarker = server.indexOf('registrationHijriahYears: normalizedRegistrationYears', hajiStart);
assert.ok(hajiStart > 0 && endMarker > hajiStart, 'syncHajiViaApiCore core must be locatable');
const hajiCore = server.slice(hajiStart, endMarker + 100);

test('haji core calls classifyAwapiSyncOutcome', () => {
  assert.match(hajiCore, /classifyAwapiSyncOutcome\(\{ fetchErrors, upsertErrors, anyRowsFetched \}\)/);
});

test('old unconditional haji throws are removed', () => {
  assert.doesNotMatch(hajiCore, /if \(fetchErrors > 0\) \{[\s\S]{0,120}throw new Error\(`Haji API fetch incomplete/);
  assert.doesNotMatch(hajiCore, /if \(upsertErrors > 0\) \{[\s\S]{0,120}throw new Error\(`Haji API upsert failed/);
});

test('haji CAPI is no longer per-batch and is gated on full success', () => {
  assert.doesNotMatch(hajiCore, /upserted \+= batch\.length;\s*\n\s*processCapiPurchases/);
  assert.match(hajiCore, /if \(outcome\.shouldNotify\) \{[\s\S]{0,220}processCapiPurchases\(agentId, slug, 'haji'/);
});

test('haji label bump is gated on shouldBump (partial + full)', () => {
  assert.match(hajiCore, /if \(outcome\.shouldBump\) \{[\s\S]{0,220}last_jamaah_haji_sync_at: now/);
});

test('haji hardfail still throws; core returns partial + ok flags', () => {
  assert.match(hajiCore, /if \(outcome\.kind === 'hardfail'\) \{[\s\S]{0,160}throw new Error/);
  assert.match(hajiCore, /partial: outcome\.kind === 'partial'/);
  assert.match(hajiCore, /ok: outcome\.kind === 'full'/);
});
