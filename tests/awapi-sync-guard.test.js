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

test('aggregate-booking lunas rows are normalized BEFORE the suspicious-payment guard runs', () => {
  const server = read('server.js');

  // resolveAggregateBookingLunasRow must run inside preserveSuspiciousAwapiPayments,
  // before the rows are filtered by hasSuspiciousAwapiPayment — otherwise the guard
  // freezes stale pre-lunas DP values again (false pelunasan-reminder bug 2026-06-05).
  assert.match(
    server,
    /async function preserveSuspiciousAwapiPayments[\s\S]{0,1200}resolveAggregateBookingLunasRow\(row\)[\s\S]{0,600}\.filter\(hasSuspiciousAwapiPayment\)/
  );
  assert.match(server, /normalizedLunasCount/);
});

test('pelunasanReminder filters out rows that are already lunas upstream', () => {
  const notifier = read('telegram-notifier.js');

  // The query must surface the live AWAPI payment fields...
  assert.match(notifier, /awapi_bayar_status:raw_data->>bayar_status/);
  assert.match(notifier, /awapi_bayar_sisa:raw_data->>bayar_sisa/);
  // ...and the reminder must be built from the filtered set, not the raw query.
  assert.match(notifier, /filter\(\(j\) => !isUpstreamLunas\(j\)\)/);
  assert.match(notifier, /collapsePelunasanBookings\(outstanding\)/);
});
