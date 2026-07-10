import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('flight card selects en-route, then delayed, then scheduled segment', async () => {
  const { selectActiveFlightSegment } = await importTsModule('src/lib/flightActiveSegment.ts');
  const fallback = { flightNumber: 'JOURNEY', status: 'scheduled' };
  const landed = { flightNumber: 'EK 802', status: 'landed' };
  const scheduled = { flightNumber: 'EK 358', status: 'scheduled' };
  const delayed = { flightNumber: 'EK 358', status: 'delayed' };
  const enRoute = { flightNumber: 'EK 802', status: 'en-route' };

  assert.equal(selectActiveFlightSegment(fallback, [landed, scheduled]), scheduled);
  assert.equal(selectActiveFlightSegment(fallback, [landed, scheduled, delayed]), delayed);
  assert.equal(selectActiveFlightSegment(fallback, [delayed, enRoute, scheduled]), enRoute);
  assert.equal(selectActiveFlightSegment(fallback, [landed]), landed);
});

test('flight status header renders the selected segment code, route, time and terminal', () => {
  const page = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');

  assert.match(page, /selectActiveFlightSegment<FlightSegmentData>\(flight, segments\)/);
  assert.match(page, /function flightWithActiveSegment\(flight: FlightData\)/);
  assert.match(page, /\{summaryFlight\.flightNumber\}/);
  assert.match(page, /summaryFlight\.depActual \|\| summaryFlight\.depScheduled/);
  assert.match(page, /summaryFlight\.arrEstimated \|\| summaryFlight\.arrScheduled/);
  assert.match(page, /\{summaryFlight\.depCode \|\| '—'\}/);
  assert.match(page, /\{summaryFlight\.arrCode \|\| '—'\}/);
  assert.match(page, /T\{summaryFlight\.depTerminal\}/);
  assert.match(page, /<KloterDetail\s+flight=\{summaryFlight\}/);
  assert.doesNotMatch(page, /<KloterDetail\s+flight=\{first\}/);
  assert.doesNotMatch(page, /hasSegmentRows \? \(first\.transitLabel/);
});
