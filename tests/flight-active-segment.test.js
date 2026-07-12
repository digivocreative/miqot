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
  const unverified = { flightNumber: 'SV 261', status: 'unverified' };

  assert.equal(selectActiveFlightSegment(fallback, [landed, scheduled]), scheduled);
  assert.equal(selectActiveFlightSegment(fallback, [landed, scheduled, delayed]), delayed);
  assert.equal(selectActiveFlightSegment(fallback, [delayed, enRoute, scheduled]), enRoute);
  assert.equal(selectActiveFlightSegment(fallback, [landed, unverified]), unverified);
  assert.equal(selectActiveFlightSegment(fallback, [landed, scheduled, unverified]), scheduled);
  assert.equal(selectActiveFlightSegment(fallback, [landed, unverified, scheduled]), unverified);
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

test('route marker stays inside the SVG at both progress endpoints', () => {
  const page = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');

  assert.match(page, /const markerEdgeInset = 8/);
  assert.match(page, /const x1 = markerEdgeInset, x2 = w - markerEdgeInset/);
  assert.match(page, /Math\.min\(1, Math\.max\(0, flight\.progress \/ 100\)\)/);
});

test('en-route traveled line renders a flowing aurora gradient without animated dashes', () => {
  const page = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');

  assert.match(page, /<linearGradient[\s\S]*stopColor="#67e8f9"[\s\S]*stopColor="#dbeafe"/);
  assert.match(page, /attributeName="x1"[\s\S]*dur="2\.8s"/);
  assert.match(page, /attributeName="x2"[\s\S]*dur="2\.8s"/);
  assert.match(page, /stroke=\{`url\(#\$\{auroraGradientId\}\)`\}/);
  assert.doesNotMatch(page, /strokeDasharray="22 78"|strokeDasharray="10 90"/);
});

test('flight card renders tour leader names in uppercase', () => {
  const page = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');

  assert.match(page, /tlClean\.toUpperCase\(\)/);
});
