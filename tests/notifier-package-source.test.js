import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildNotifierPackagesUrl } from '../lib/notifier-package-source.js';

test('buildNotifierPackagesUrl: uses public schedules endpoint shared with package detail page', () => {
  assert.equal(
    buildNotifierPackagesUrl('http://localhost:3000', '1448'),
    'http://localhost:3000/api/schedules/1448'
  );
});

test('buildNotifierPackagesUrl: trims trailing slash from base URL', () => {
  assert.equal(
    buildNotifierPackagesUrl('https://alhijaz.co/', '1449'),
    'https://alhijaz.co/api/schedules/1449'
  );
});
