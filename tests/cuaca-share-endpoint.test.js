import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = server.indexOf("app.get('/api/weather/share-image'");
const route = start >= 0 ? server.slice(start, server.indexOf('\n});', start)) : '';

test('share-image route is authenticated and takes identity from the session only', () => {
  assert.ok(route, 'route /api/weather/share-image ada');
  assert.match(route, /authMiddleware/);
  assert.match(route, /getAgentById\(req\.user\.id\)/);
  assert.match(route, /resolveCuacaShareCity\(req\.query\.city, weatherMemory\.cities\)/);
  assert.doesNotMatch(route, /req\.query\.(?!city\b)\w+/);
  assert.doesNotMatch(route, /fetchAllCitiesWeather|api\.open-meteo/);
});

test('validation runs before render and cache', () => {
  const validate = route.indexOf('resolveCuacaShareCity(');
  assert.ok(validate > 0);
  assert.ok(validate < route.indexOf('getOrCreateCuacaShareImage('));
  assert.ok(validate < route.indexOf('getAgentById('));
  assert.match(route, /'X-Cuaca-Image-Cache': result\.cacheHit \? 'HIT' : 'MISS'/);
  assert.match(route, /Sentry\.captureException/);
});

test('cache cleanup runs at startup and in the 03:30 WIB cron', () => {
  assert.match(server, /runCuacaShareCacheCleanup\('startup'\);/);
  assert.match(server, /cron\.schedule\('30 3 \* \* \*', \(\) => \{\n\s+runKursShareCacheCleanup\('daily'\);\n\s+runCuacaShareCacheCleanup\('daily'\);/);
});

test('analytics events are registered so they are not dropped', () => {
  assert.match(server, /open_share_cuaca: 'Bagikan Cuaca'/);
  assert.match(server, /download_share_cuaca: 'Unduh Gambar Cuaca'/);
  assert.match(server, /share_cuaca: 'Bagikan Cuaca'/);
  assert.match(server, /copy_cuaca_caption: 'Salin Caption Cuaca'/);
});

test('rendered banners (agent names + photos) never reach the public repo', () => {
  const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gitignore, /^data\/cuaca-share-cache\/$/m);
});

test('a failed agent-photo fetch is not cached for the whole sync window', () => {
  assert.match(route, /cache: !\(isAllowedAgentPhotoUrl\(identity\.photo\) && !assets\.agentPhotoSrc\)/);
});
