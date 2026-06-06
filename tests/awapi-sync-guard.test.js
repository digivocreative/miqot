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
  // before the guard pass filters by hasSuspiciousAwapiPayment — otherwise the guard
  // freezes stale pre-lunas DP values again (false pelunasan-reminder bug 2026-06-05).
  assert.match(
    server,
    /async function preserveSuspiciousAwapiPayments[\s\S]{0,2500}resolveAggregateBookingLunasRow\(row,[\s\S]{0,700}\.filter\(hasSuspiciousAwapiPayment\)/
  );
  assert.match(server, /normalizedLunasCount/);
});

test('aggregate-booking lunas proof is booking-aware, not divisor-based (A2/B2 2026-06-06)', () => {
  const server = read('server.js');
  const client = read('awapi-client.js');

  // The resolver must receive the per-booking price universe built from the
  // payload + every existing pax of the booking — a bare modulo test wrongly
  // normalized k-of-n-pax partial payments to lunas (the same LEBIH BAYAR
  // shape appears on bookings that still owe money, e.g. AIW0027949).
  assert.match(server, /buildBookingPriceIndex\(incomingRows,\s*existingRows\)/);
  assert.match(server, /\.in\('id_umroh',\s*bookingIds\)/);
  assert.match(client, /aggregateBayar < bookingPriceTotal/);
  assert.doesNotMatch(client, /aggregateBayar % hargaPaket/);
});

test('pelunasanReminder filters out rows that are already lunas upstream', () => {
  const notifier = read('telegram-notifier.js');

  // The query must surface the live AWAPI payment fields...
  assert.match(notifier, /awapi_bayar_status:raw_data->>bayar_status/);
  assert.match(notifier, /awapi_bayar_sisa:raw_data->>bayar_sisa/);
  // ...the reminder must be built from the filtered set, not the raw query,
  // and must carry the proven booking-level outstanding for aggregate-shape
  // bookings whose DB `sisa` is the stale preserved DP value...
  assert.match(notifier, /collapsePelunasanBookings\(outstanding,\s*aggregateOutstandingByKey\)/);
  assert.match(notifier, /bookingAggregateOutstanding\(paxRows\)/);
  // ...and aggregate-shape lunas claims must pass booking-level proof before
  // being suppressed — partially-paid multi-pax bookings claim LEBIH BAYAR too,
  // and their legitimate reminders must keep firing (A2, 2026-06-06).
  assert.match(notifier, /bookingProvenOutstanding\(bookingPaxRows\.get\(/);
  assert.match(notifier, /awapi_paket_harga:raw_data->>paket_harga/);
  // The query must order by jm_id so the collapsed booking's primary name is
  // deterministically the first-registered pax, not physical row order.
  assert.match(notifier, /\.order\('jm_id'/);
});
