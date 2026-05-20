import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const server = readFileSync(join(root.pathname, 'server.js'), 'utf8');

test('server wires haji AWAPI client functions into a dedicated sync core', () => {
  assert.match(server, /awapiFetchHajiByKeberangkatan/);
  assert.match(server, /awapiFetchHajiByPendaftaran/);
  assert.match(server, /normalizeAwapiHajiRow/);
  assert.match(server, /async function syncHajiViaApiCore/);
});

test('manual haji sync is AWAPI-first when AWAPI_SYNC_ENABLED is true', () => {
  assert.match(
    server,
    /const awapiEnabled = process\.env\.AWAPI_SYNC_ENABLED === 'true'[\s\S]{0,1600}if \(awapiEnabled\)[\s\S]{0,900}syncHajiViaApiCore/
  );
});

test('legacy haji scraper is scheduled enrichment instead of the 30 minute primary loop', () => {
  assert.match(server, /async function runScheduledHajiLegacyEnrichment/);
  assert.match(server, /function scheduleHajiLegacyEnrichment/);
  assert.match(server, /DEFAULT_UMROH_PHASE2_TIMES_WIB/);
  assert.doesNotMatch(server, /const HAJI_SYNC_COOLDOWN_MS = 30 \* 60 \* 1000/);
});
