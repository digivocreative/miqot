import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('AWAPI umroh sync preserves existing payment when payment rows are suspicious', () => {
  const server = read('server.js');

  assert.match(server, /hasSuspiciousAwapiPayment/);
  assert.match(server, /preserveSuspiciousAwapiPayments\(agentId,\s*allRows\)/);
  assert.match(server, /guardedAwapiRows\.guardedCount/);
  assert.doesNotMatch(server, /const suspiciousPaymentRows = allRows\.filter\(hasSuspiciousAwapiPayment\);[\s\S]{0,700}throw new Error\(`AWAPI payment anomaly/);
});

test('single jamaah refresh preserves existing payment when AWAPI payment is suspicious', () => {
  const server = read('server.js');

  assert.match(server, /preserveExistingPaymentForSuspiciousAwapiRow/);
  assert.match(server, /awapi-payment-preserved/);
  assert.doesNotMatch(server, /if \(hasSuspiciousAwapiPayment\(norm\)\) {\s*return res\.status\(409\)/);
});
