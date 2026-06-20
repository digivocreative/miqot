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

test('flight card date key uses calendar eventDate before UTC ISO depDate', async () => {
  const { flightCardDateKey, flightCardDisplayDateValue } = await importTsModule('src/lib/flightCardDate.ts');

  const flight = {
    flightNumber: 'SV 827',
    eventDate: '2026-06-21',
    depDate: '2026-06-20T17:40:00.000Z',
    depScheduled: '00:40',
  };

  assert.equal(flightCardDateKey(flight), '2026-06-21');
  assert.equal(flightCardDisplayDateValue(flight), '2026-06-21T00:00:00');
});

test('flight card grouping keeps adjacent same-number flights on separate calendar dates', async () => {
  const { flightCardGroupKey } = await importTsModule('src/lib/flightCardDate.ts');

  const sv827June20 = {
    flightNumber: 'SV 827',
    eventDate: '2026-06-20',
    depDate: '2026-06-20T00:00:00',
  };
  const sv827June21 = {
    flightNumber: 'SV 827',
    eventDate: '2026-06-21',
    depDate: '2026-06-20T17:40:00.000Z',
  };

  assert.equal(flightCardGroupKey(sv827June20), 'SV 827__2026-06-20');
  assert.equal(flightCardGroupKey(sv827June21), 'SV 827__2026-06-21');
  assert.notEqual(flightCardGroupKey(sv827June20), flightCardGroupKey(sv827June21));
});
