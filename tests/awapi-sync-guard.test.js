import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('AWAPI umroh sync falls back to legacy when payment rows are suspicious', () => {
  const server = read('server.js');

  assert.match(server, /hasSuspiciousAwapiPayment/);
  assert.match(server, /AWAPI payment anomaly/);
  assert.match(server, /throw new Error\(`AWAPI payment anomaly/);
});
