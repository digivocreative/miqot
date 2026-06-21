import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('admin jamaah payment percentage is clamped for negative sisa values', () => {
  const page = read('src/components/JamaahPage.tsx');

  assert.match(page, /safeSisaForPct/);
  assert.match(page, /Math\.max\(0,\s*Math\.min\(100/);
  assert.doesNotMatch(page, /const total = item\.bayar \+ item\.sisa;\s*const pct = total > 0 \? Math\.round/);
});

test('admin jamaah neutralized AWAPI payment is not treated as Belum DP', () => {
  const page = read('src/components/JamaahPage.tsx');
  const server = read('server.js');

  assert.match(page, /function hasNeutralizedAwapiPayment/);
  assert.match(page, /payment_guard === 'neutralized_new_after_awapi_anomaly'/);
  assert.match(page, /function getPaymentStatus/);
  assert.match(page, /item\.bayar > 0 \|\| hasNeutralizedAwapiPayment\(item\)/);
  assert.match(page, /function isBelumDPJamaah[\s\S]{0,180}getPaymentStatus\(item\) === 'belum'/);

  assert.match(server, /function hasNeutralizedNewAwapiPayment/);
  assert.match(server, /payment_status === 'belum_dp'[\s\S]{0,140}!hasNeutralizedNewAwapiPayment\(r\)/);
  assert.match(server, /const isBelumDP = \(r\) =>[\s\S]{0,180}!hasNeutralizedNewAwapiPayment\(r\)/);
});

test('admin jamaah Phase 2 sync label mentions documents and equipment', () => {
  const page = read('src/components/JamaahPage.tsx');

  assert.match(page, /Melengkapi dokumen & perlengkapan/);
  assert.doesNotMatch(page, /Memperbarui data perlengkapan/);
});

test('admin jamaah sync uses phase and count from an already-running sync response', () => {
  const page = read('src/components/JamaahPage.tsx');

  assert.match(page, /setSyncedCount\(0\);[\s\S]*const nextSyncedCount = result\.data\.totalSynced \?\? result\.data\.initialCount;/);
  assert.match(page, /if \(typeof nextSyncedCount === 'number'\) setSyncedCount\(nextSyncedCount\);/);
  assert.match(page, /if \(typeof result\.data\.phase === 'number'\) setSyncPhase\(result\.data\.phase\);/);
});
