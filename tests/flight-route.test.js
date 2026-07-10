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

test('live airplane position is a point on the rendered route', async () => {
  const { buildFlightPathGeometry } = await importTsModule('src/lib/flightRoute.ts');
  const livePosition = [24.5, 53.2];
  const geometry = buildFlightPathGeometry({
    start: [21.6796, 39.1565],
    end: [25.2532, 55.3657],
    progress: 88,
    livePosition,
  });

  assert.equal(geometry.usesLivePosition, true);
  assert.deepEqual(geometry.planePosition, livePosition);
  assert.deepEqual(geometry.traveledPath.at(-1), geometry.planePosition);
  assert.ok(geometry.path.some(point => point === geometry.planePosition));
});

test('implausible live coordinates fall back to progress on the route', async () => {
  const { buildFlightPathGeometry } = await importTsModule('src/lib/flightRoute.ts');
  const stalePosition = [-6.1256, 106.6558];
  const geometry = buildFlightPathGeometry({
    start: [21.6796, 39.1565],
    end: [25.2532, 55.3657],
    progress: 88,
    livePosition: stalePosition,
  });

  assert.equal(geometry.usesLivePosition, false);
  assert.notDeepEqual(geometry.planePosition, stalePosition);
  assert.deepEqual(geometry.traveledPath.at(-1), geometry.planePosition);
});

test('great-circle route no longer uses a fixed decorative latitude offset', async () => {
  const { generateGreatCirclePath } = await importTsModule('src/lib/flightRoute.ts');
  const path = generateGreatCirclePath([21.6796, 39.1565], [25.2532, 55.3657], 50);
  const midpoint = path[Math.floor(path.length / 2)];

  assert.ok(midpoint[0] < 26, `unexpected decorative arc latitude: ${midpoint[0]}`);
  assert.deepEqual(path[0], [21.6796, 39.1565]);
  assert.ok(Math.abs(path.at(-1)[0] - 25.2532) < 1e-9);
  assert.ok(Math.abs(path.at(-1)[1] - 55.3657) < 1e-9);
});
