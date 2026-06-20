import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('flight status entries use jadwal_id fallback when group_number is empty', () => {
  const start = serverSource.indexOf('const entryId =');
  const entryIdBlock = serverSource.slice(start, start + 400);
  assert.match(entryIdBlock, /event\.jadwal_id\s*\?\s*`\$\{flightId\}_j\$\{event\.jadwal_id\}`/);
});
