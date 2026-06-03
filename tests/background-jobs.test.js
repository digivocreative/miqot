import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  parseEnvBoolean,
  shouldRunBackgroundJobs,
  shouldRunJamaahBackgroundSync,
  shouldRunLegacyBackgroundSync,
} from '../lib/background-jobs.js';

test('shouldRunBackgroundJobs: disables background jobs by default in local env', () => {
  assert.equal(shouldRunBackgroundJobs({}), false);
  assert.equal(shouldRunBackgroundJobs({ NODE_ENV: 'development' }), false);
});

test('shouldRunBackgroundJobs: enables background jobs in production by default', () => {
  assert.equal(shouldRunBackgroundJobs({ NODE_ENV: 'production' }), true);
});

test('shouldRunBackgroundJobs: ENABLE_BACKGROUND_JOBS explicitly overrides NODE_ENV', () => {
  assert.equal(
    shouldRunBackgroundJobs({ NODE_ENV: 'development', ENABLE_BACKGROUND_JOBS: 'true' }),
    true,
  );
  assert.equal(
    shouldRunBackgroundJobs({ NODE_ENV: 'production', ENABLE_BACKGROUND_JOBS: 'false' }),
    false,
  );
});

test('parseEnvBoolean: accepts common true/false strings and ignores unknown values', () => {
  assert.equal(parseEnvBoolean('1'), true);
  assert.equal(parseEnvBoolean('yes'), true);
  assert.equal(parseEnvBoolean('0'), false);
  assert.equal(parseEnvBoolean('off'), false);
  assert.equal(parseEnvBoolean('maybe'), null);
  assert.equal(parseEnvBoolean(undefined), null);
});

test('shouldRunLegacyBackgroundSync: disabled only by explicit env flag', () => {
  assert.equal(shouldRunLegacyBackgroundSync({}), true);
  assert.equal(shouldRunLegacyBackgroundSync({ DISABLE_LEGACY_BACKGROUND_SYNC: 'false' }), true);
  assert.equal(shouldRunLegacyBackgroundSync({ DISABLE_LEGACY_BACKGROUND_SYNC: 'true' }), false);
  assert.equal(shouldRunLegacyBackgroundSync({ DISABLE_LEGACY_BACKGROUND_SYNC: '1' }), false);
});

test('shouldRunJamaahBackgroundSync: disabled only by explicit env flag', () => {
  assert.equal(shouldRunJamaahBackgroundSync({}), true);
  assert.equal(shouldRunJamaahBackgroundSync({ DISABLE_JAMAAH_BACKGROUND_SYNC: 'false' }), true);
  assert.equal(shouldRunJamaahBackgroundSync({ DISABLE_JAMAAH_BACKGROUND_SYNC: 'true' }), false);
  assert.equal(shouldRunJamaahBackgroundSync({ DISABLE_JAMAAH_BACKGROUND_SYNC: '1' }), false);
});

test('server.js gates Telegram notifier and kurs cron behind the background job guard', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(
    source,
    /import \{ shouldRunBackgroundJobs, shouldRunJamaahBackgroundSync, shouldRunLegacyBackgroundSync \} from '\.\/lib\/background-jobs\.js';/,
  );
  assert.match(
    source,
    /if \(shouldRunBackgroundJobs\(\)\) \{\s*scheduleKursCron\(\);\s*\} else \{/s,
  );
  assert.match(
    source,
    /if \(shouldRunBackgroundJobs\(\)\) \{\s*initNotifier\(\);\s*\} else \{/s,
  );
});

test('server.js gates legacy background schedulers behind legacy flag', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(source, /const JAMAAH_BACKGROUND_SYNC_ENABLED = shouldRunJamaahBackgroundSync\(\);/);
  assert.match(source, /const LEGACY_BACKGROUND_SYNC_ENABLED = shouldRunLegacyBackgroundSync\(\);/);
  assert.match(
    source,
    /if \(LEGACY_BACKGROUND_SYNC_ENABLED\) \{\s*scheduleUmrohPhase2Enrichment\(\);\s*scheduleHajiLegacyEnrichment\(\);\s*\} else \{/s,
  );
  assert.match(source, /legacy background fallback disabled/);
});
