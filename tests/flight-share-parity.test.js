import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

const dashboard = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');
const sharePage = readFileSync(new URL('../src/components/FlightSharePage.tsx', import.meta.url), 'utf8');
const routeLine = readFileSync(new URL('../src/components/FlightRouteLine.tsx', import.meta.url), 'utf8');

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('dashboard and public share page use the same status presentation and route bar', () => {
  assert.match(dashboard, /import FlightRouteLine from ['"]\.\/FlightRouteLine['"]/);
  assert.match(sharePage, /import FlightRouteLine from ['"]\.\/FlightRouteLine['"]/);
  assert.match(dashboard, /getFlightStatusPresentation\(summaryFlight\.status\)/);
  assert.match(sharePage, /getFlightStatusPresentation\(currentFlightStatus\)/);
  assert.match(dashboard, /<FlightRouteLine flight=\{summaryFlight\}/);
  assert.match(sharePage, /<FlightRouteLine[\s\S]*status: currentFlightStatus[\s\S]*progress: flight\.progress/);
  assert.doesNotMatch(sharePage, /flex-1 h-\[3px\] bg-emerald-500/);
  assert.doesNotMatch(sharePage, /flight\.is_live|status\.label\.toUpperCase\(\)/);
});

test('shared route bar preserves every dashboard status animation branch', () => {
  assert.match(routeLine, /status === 'scheduled'[\s\S]*stroke-dashoffset/);
  assert.match(routeLine, /status === 'en-route'[\s\S]*auroraGradientId/);
  assert.match(routeLine, /status === 'delayed'[\s\S]*stroke-dashoffset/);
  assert.match(routeLine, /status === 'landed'[\s\S]*values="3;6;5"/);
  assert.match(routeLine, /status === 'cancelled'[\s\S]*strokeDasharray="3 3"/);
});

test('public share page refreshes status and progress on the dashboard cadence', () => {
  assert.match(sharePage, /const FLIGHT_SHARE_REFRESH_MS = 30 \* 60 \* 1000/);
  assert.match(sharePage, /window\.setInterval\([\s\S]*loadFlight\(\)[\s\S]*FLIGHT_SHARE_REFRESH_MS/);
  assert.match(sharePage, /cache: 'no-store'/);
});

test('unknown statuses safely use the same scheduled fallback', async () => {
  const { getFlightStatusPresentation, normalizeFlightStatus } = await importTsModule(
    'src/lib/flightStatusPresentation.ts',
  );

  assert.equal(normalizeFlightStatus('ACTIVE'), 'scheduled');
  assert.equal(normalizeFlightStatus('toString'), 'scheduled');
  assert.equal(normalizeFlightStatus('en-route'), 'en-route');
  assert.equal(getFlightStatusPresentation('landed').label, 'Mendarat');
  assert.equal(getFlightStatusPresentation('unknown').label, 'Dijadwalkan');
});
