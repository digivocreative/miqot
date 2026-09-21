import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SCHEDULE_RESPONSE_CACHE_TTL_MS,
  createScheduleResponseCache,
} from '../lib/schedule-response-cache.js';

// Cache in-memory GET /api/schedules/:yearCode (audit kecepatan 21 Sep 2026).
// Yang dikunci: payload hit IDENTIK (referensi sama, bukan salinan), TTL 60 dtk
// yang tegas, invalidate() membuang semua tahun, dan server.js memasangnya di
// tempat yang benar (hanya respons sukses yang disimpan; invalidasi di akhir
// ScheduleSync dan BunnySync).

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, tick: (ms) => { t += ms; } };
}

test('miss → null; hit mengembalikan referensi payload yang sama persis', () => {
  const cache = createScheduleResponseCache();
  assert.equal(cache.get('1448'), null);
  assert.equal(cache.size, 0);

  const body = { status: 'ok', iTotalDisplayRecords: 2, aaData: [{ jadwal_id: 'A' }, { jadwal_id: 'B' }] };
  cache.set('1448', body);
  assert.equal(cache.get('1448'), body, 'payload hit harus objek yang sama (identik)');
  assert.equal(cache.size, 1);
  assert.deepEqual(cache.get('1448'), {
    status: 'ok', iTotalDisplayRecords: 2, aaData: [{ jadwal_id: 'A' }, { jadwal_id: 'B' }],
  });
});

test('TTL default 60 dtk: segar di 59.999 ms, basi (dan dibuang) tepat di 60.000 ms', () => {
  assert.equal(SCHEDULE_RESPONSE_CACHE_TTL_MS, 60 * 1000);
  const clock = fakeClock();
  const cache = createScheduleResponseCache({ now: clock.now });
  const body = { status: 'ok', iTotalDisplayRecords: 0, aaData: [] };
  cache.set('1448', body);

  clock.tick(59_999);
  assert.equal(cache.get('1448'), body);

  clock.tick(1);
  assert.equal(cache.get('1448'), null, 'lewat TTL harus miss');
  assert.equal(cache.size, 0, 'entri basi dibuang saat dibaca');
});

test('ttlMs bisa disuntik; set ulang memperbarui stempel waktu', () => {
  const clock = fakeClock();
  const cache = createScheduleResponseCache({ ttlMs: 100, now: clock.now });
  cache.set('1448', { v: 1 });
  clock.tick(80);
  cache.set('1448', { v: 2 });
  clock.tick(80);
  assert.deepEqual(cache.get('1448'), { v: 2 }, 'set ulang di 80 ms → masih segar di 160 ms');
  clock.tick(20);
  assert.equal(cache.get('1448'), null);
});

test('tahun berbeda independen; invalidate() membuang semuanya sekaligus', () => {
  const cache = createScheduleResponseCache();
  cache.set('1448', { y: '1448' });
  cache.set('1449', { y: '1449' });
  assert.deepEqual(cache.get('1448'), { y: '1448' });
  assert.deepEqual(cache.get('1449'), { y: '1449' });
  assert.equal(cache.size, 2);

  cache.invalidate();
  assert.equal(cache.get('1448'), null);
  assert.equal(cache.get('1449'), null);
  assert.equal(cache.size, 0);

  // Setelah invalidate cache tetap bisa dipakai lagi.
  cache.set('1448', { y: 'baru' });
  assert.deepEqual(cache.get('1448'), { y: 'baru' });
});

test('server.js: hanya respons sukses yang disimpan, hit dibaca setelah validasi tahun', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("app.get('/api/schedules/:yearCode'");
  assert.ok(routeStart > -1, 'rute /api/schedules/:yearCode tidak ditemukan');
  const routeEnd = source.indexOf('\n});', routeStart);
  const route = source.slice(routeStart, routeEnd);

  const yearGuard = route.indexOf("error: 'Year not active'");
  const cacheGet = route.indexOf('scheduleResponseCache.get(yearCode)');
  const dbRead = route.indexOf(".from('umroh_schedules')");
  assert.ok(yearGuard > -1 && cacheGet > -1 && dbRead > -1);
  assert.ok(yearGuard < cacheGet && cacheGet < dbRead, 'urutan: validasi tahun → cek cache → query DB');

  // set() tepat sekali di seluruh server.js — pada payload status 'ok', sebelum res.json(body).
  const sets = source.match(/scheduleResponseCache\.set\(/g) ?? [];
  assert.equal(sets.length, 1, 'scheduleResponseCache.set hanya untuk payload sukses');
  const setAt = route.indexOf('scheduleResponseCache.set(yearCode, body)');
  assert.ok(setAt > -1);
  assert.ok(route.lastIndexOf("status: 'ok'", setAt) > -1, 'body yang disimpan berstatus ok');
  assert.ok(route.indexOf('res.json(body)', setAt) > setAt, 'res.json(body) setelah set');
  // Cabang error (500) tidak menyentuh cache.
  const errorBranch = route.slice(setAt);
  assert.equal((errorBranch.match(/scheduleResponseCache\.set/g) ?? []).length, 1);
});

test('server.js: invalidasi di akhir syncUmrohSchedules() dan syncFilesToBunny()', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  const scheduleSyncStart = source.indexOf('async function syncUmrohSchedules()');
  const scheduleSyncLog = source.indexOf('[ScheduleSync] Complete:', scheduleSyncStart);
  const scheduleSyncEnd = source.indexOf('\n}\n', scheduleSyncLog);
  assert.ok(scheduleSyncStart > -1 && scheduleSyncLog > -1);
  const scheduleTail = source.slice(scheduleSyncLog, scheduleSyncEnd);
  assert.match(scheduleTail, /invalidateScheduleResponseCache\(\);/, 'invalidate setelah log Complete ScheduleSync');

  const bunnySyncStart = source.indexOf('async function syncFilesToBunny(');
  const bunnySyncLog = source.indexOf('[BunnySync] Complete:', bunnySyncStart);
  const bunnySyncEnd = source.indexOf('\n}\n', bunnySyncLog);
  assert.ok(bunnySyncStart > -1 && bunnySyncLog > -1);
  const bunnyTail = source.slice(bunnySyncLog, bunnySyncEnd);
  assert.match(bunnyTail, /invalidateScheduleResponseCache\(\);/, 'invalidate setelah log Complete BunnySync');

  assert.match(source, /function invalidateScheduleResponseCache\(\) \{\s*scheduleResponseCache\.invalidate\(\);/);
  assert.match(source, /import \{ createScheduleResponseCache \} from '\.\/lib\/schedule-response-cache\.js';/);
});
