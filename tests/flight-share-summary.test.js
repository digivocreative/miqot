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

test('summarizeFlightShareGroup includes every kloter on the same flight', async () => {
  const { summarizeFlightShareGroup } = await importTsModule('src/lib/flightShareSummary.ts');

  assert.deepEqual(
    summarizeFlightShareGroup([
      { group: '170', pax: 47, tourLeader: '• YULITA ACHMAD RAMLI ARIEF' },
      { group: '171', pax: 46, tourLeader: '• AN NISSA RACHMAN KUSUMAH' },
    ]),
    {
      group_number: '170, 171',
      pax: 93,
      tour_leader: 'YULITA ACHMAD RAMLI ARIEF, AN NISSA RACHMAN KUSUMAH',
    }
  );
});

test('summarizeFlightShareGroup dedupes group and TL values', async () => {
  const { summarizeFlightShareGroup } = await importTsModule('src/lib/flightShareSummary.ts');

  assert.deepEqual(
    summarizeFlightShareGroup([
      { group: '5', pax: 20, tourLeader: '• DESI WURYANINGSIH' },
      { group: '5', pax: 23, tourLeader: 'DESI WURYANINGSIH' },
    ]),
    {
      group_number: '5',
      pax: 43,
      tour_leader: 'DESI WURYANINGSIH',
    }
  );
});
