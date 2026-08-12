import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('endpoint itinerary membandingkan cache dengan hash jadwal sebelum menyajikan', () => {
  const route = server.slice(
    server.indexOf("app.get('/api/itinerary/:jadwalId'"),
    server.indexOf('// Itinerary Background Sync'),
  );

  assert.match(route, /loadItineraryCacheSnapshot\(jadwalId\)/);
  assert.match(route, /canServeItineraryCache\(cached, schedule\)/);
  assert.match(route, /refreshCurrentItineraryOnce\(schedule\)/);
  assert.match(route, /status\(503\)/);
  assert.doesNotMatch(route, /req\.query\.pdfUrl/);
  assert.equal((route.match(/data:\s*cached\.content/g) || []).length, 1);
  assert.ok(
    route.indexOf('data: cached.content') > route.indexOf('if (canServeItineraryCache(cached, schedule))'),
    'cached.content hanya boleh berada di cabang cache yang sudah lolos guard',
  );
});

test('perubahan PDF langsung diikuti refresh cache setelah sync Bunny harian', () => {
  const scheduler = server.slice(
    server.indexOf('function scheduleDailyBunnySync()'),
    server.indexOf('// ── Bunny cleanup:'),
  );

  const mirrorAt = scheduler.indexOf('await queueFilesToBunny()');
  const refreshAt = scheduler.indexOf('await queueItinerarySync()');
  assert.ok(mirrorAt >= 0, 'sync PDF harian harus tetap dijalankan');
  assert.ok(refreshAt > mirrorAt, 'refresh cache harus berjalan setelah fingerprint PDF diperbarui');
});

test('semua pemicu background memakai single-flight itinerary sync', () => {
  const background = server.slice(server.indexOf('// ── Itinerary background sync:'));
  assert.match(background, /queueItinerarySync\(\)/);
  assert.doesNotMatch(background, /syncAllItineraries\(\)\.catch/);
});

test('refresh versi berbeda diserialkan dan hash dicek ulang sebelum cache ditulis', () => {
  const parseAndCache = server.slice(
    server.indexOf('async function parseAndCacheCurrentItinerary('),
    server.indexOf('function refreshCurrentItineraryOnce('),
  );
  const singleFlight = server.slice(
    server.indexOf('function refreshCurrentItineraryOnce('),
    server.indexOf('// API: AI Itinerary'),
  );

  assert.ok(
    parseAndCache.indexOf('currentSha !== expectedSha') < parseAndCache.indexOf(".from('itineraries').upsert"),
    'versi jadwal harus diverifikasi ulang sebelum upsert cache',
  );
  assert.match(singleFlight, /itineraryRefreshInFlight\.get\(jadwalId\)/);
  assert.match(singleFlight, /existing\?\.version === version/);
  assert.match(singleFlight, /existing\.promise[\s\S]*refreshCurrentItineraryOnce\(schedule/);
});
