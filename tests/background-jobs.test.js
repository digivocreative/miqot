import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  parseEnvBoolean,
  shouldRunBackgroundJobs,
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

test('server.js gates Telegram notifier and kurs cron behind the background job guard', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(
    source,
    /import \{ shouldRunBackgroundJobs \} from '\.\/lib\/background-jobs\.js';/,
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
