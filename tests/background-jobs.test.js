import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
  parseEnvBoolean,
  shouldRunBackgroundJobs,
  shouldRunJamaahBackgroundSync,
  shouldRunLegacyBackgroundSync,
  msUntilNextWibHour,
} from '../lib/background-jobs.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

test('shouldRunBackgroundJobs: disables background jobs by default in local env', () => {
  assert.equal(shouldRunBackgroundJobs({}), false);
  assert.equal(shouldRunBackgroundJobs({ NODE_ENV: 'development' }), false);
});

test('shouldRunBackgroundJobs: enables background jobs in production by default', () => {
  assert.equal(shouldRunBackgroundJobs({ NODE_ENV: 'production' }), true);
});

test('shouldRunBackgroundJobs: ENABLE_BACKGROUND_JOBS explicitly overrides NODE_ENV', () => {
  assert.equal(
    shouldRunBackgroundJobs({ NODE_ENV: 'development', ENABLE_BACKGROUND_JOBS: 'true' }),
    true,
  );
  assert.equal(
    shouldRunBackgroundJobs({ NODE_ENV: 'production', ENABLE_BACKGROUND_JOBS: 'false' }),
    false,
  );
});

test('parseEnvBoolean: accepts common true/false strings and ignores unknown values', () => {
  assert.equal(parseEnvBoolean('1'), true);
  assert.equal(parseEnvBoolean('yes'), true);
  assert.equal(parseEnvBoolean('0'), false);
  assert.equal(parseEnvBoolean('off'), false);
  assert.equal(parseEnvBoolean('maybe'), null);
  assert.equal(parseEnvBoolean(undefined), null);
});

test('shouldRunLegacyBackgroundSync: disabled only by explicit env flag', () => {
  assert.equal(shouldRunLegacyBackgroundSync({}), true);
  assert.equal(shouldRunLegacyBackgroundSync({ DISABLE_LEGACY_BACKGROUND_SYNC: 'false' }), true);
  assert.equal(shouldRunLegacyBackgroundSync({ DISABLE_LEGACY_BACKGROUND_SYNC: 'true' }), false);
  assert.equal(shouldRunLegacyBackgroundSync({ DISABLE_LEGACY_BACKGROUND_SYNC: '1' }), false);
});

test('shouldRunJamaahBackgroundSync: disabled only by explicit env flag', () => {
  assert.equal(shouldRunJamaahBackgroundSync({}), true);
  assert.equal(shouldRunJamaahBackgroundSync({ DISABLE_JAMAAH_BACKGROUND_SYNC: 'false' }), true);
  assert.equal(shouldRunJamaahBackgroundSync({ DISABLE_JAMAAH_BACKGROUND_SYNC: 'true' }), false);
  assert.equal(shouldRunJamaahBackgroundSync({ DISABLE_JAMAAH_BACKGROUND_SYNC: '1' }), false);
});

test('server.js gates Telegram notifier and kurs cron behind the background job guard', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  // Cukup pastikan gerbangnya diimpor dari modul ini — memaku seluruh daftar
  // named import bikin tes merah tiap ada helper baru yang tak ada urusannya
  // dengan gating.
  assert.match(
    source,
    /import \{[^}]*\bshouldRunBackgroundJobs\b[^}]*\} from '\.\/lib\/background-jobs\.js';/,
  );
  assert.match(
    source,
    /if \(shouldRunBackgroundJobs\(\)\) \{\s*scheduleKursCron\(\);\s*\} else \{/s,
  );
  assert.match(
    source,
    /if \(shouldRunBackgroundJobs\(\)\) \{\s*initNotifier\(\);\s*\} else \{/s,
  );
});

test('server.js gates legacy background schedulers behind legacy flag', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(source, /const JAMAAH_BACKGROUND_SYNC_ENABLED = shouldRunJamaahBackgroundSync\(\);/);
  assert.match(source, /const LEGACY_BACKGROUND_SYNC_ENABLED = shouldRunLegacyBackgroundSync\(\);/);
  assert.match(
    source,
    /if \(LEGACY_BACKGROUND_SYNC_ENABLED\) \{\s*scheduleUmrohPhase2Enrichment\(\);\s*scheduleHajiLegacyEnrichment\(\);\s*\} else \{/s,
  );
  assert.match(source, /legacy background fallback disabled/);
});


// ── msUntilNextWibHour ──────────────────────────────────────────────
// 03:00 WIB = 20:00 UTC hari sebelumnya. Kalau konversinya salah, sync harian
// tetap jalan tiap 24 jam — cuma di jam yang keliru, tanpa error apa pun.

test('msUntilNextWibHour: 03:00 WIB jatuh di 20:00 UTC hari sebelumnya', () => {
  // 19:00 UTC = 02:00 WIB (hari berikutnya) → tinggal 1 jam lagi.
  assert.equal(msUntilNextWibHour(3, new Date('2026-08-29T19:00:00Z')), HOUR);
  // 20:00:00 UTC persis = target barusan lewat → lompat ke besok.
  assert.equal(msUntilNextWibHour(3, new Date('2026-08-29T20:00:00Z')), 24 * HOUR);
  // 20:01 UTC → 23 jam 59 menit lagi.
  assert.equal(msUntilNextWibHour(3, new Date('2026-08-29T20:01:00Z')), 24 * HOUR - MINUTE);
});

test('msUntilNextWibHour: target selalu mendarat di menit :00 WIB yang diminta', () => {
  for (const wibHour of [0, 3, 7, 12, 23]) {
    const now = new Date('2026-08-29T13:37:42.500Z');
    const target = new Date(now.getTime() + msUntilNextWibHour(wibHour, now));
    const wibClock = new Date(target.getTime() + 7 * HOUR); // UTC → WIB
    assert.equal(wibClock.getUTCHours(), wibHour, `jam WIB meleset untuk ${wibHour}`);
    assert.equal(wibClock.getUTCMinutes(), 0);
    assert.equal(wibClock.getUTCSeconds(), 0);
    assert.equal(wibClock.getUTCMilliseconds(), 0);
  }
});

test('msUntilNextWibHour: selalu ke depan dan tidak pernah lewat 24 jam', () => {
  // Sapu satu hari penuh per 37 menit — menangkap kesalahan pembungkusan hari
  // (mis. jam UTC negatif) yang cuma muncul di jendela waktu tertentu.
  for (let m = 0; m < 24 * 60; m += 37) {
    const now = new Date(Date.UTC(2026, 7, 29, 0, m, 0));
    const ms = msUntilNextWibHour(3, now);
    assert.ok(ms > 0, `harus positif di menit ${m}, dapat ${ms}`);
    assert.ok(ms <= 24 * HOUR, `tidak boleh > 24 jam di menit ${m}, dapat ${ms}`);
  }
});

test('msUntilNextWibHour: menolak jam di luar 0-23', () => {
  for (const bad of [-1, 24, 3.5, '3', null, undefined, NaN]) {
    assert.throws(() => msUntilNextWibHour(bad, new Date('2026-08-29T00:00:00Z')), RangeError);
  }
});

test('msUntilNextWibHour: tetap 03:00 WIB di server dengan DST', () => {
  // setDate() memakai tanggal LOKAL proses. Di malam maju-jam DST satu "hari
  // lokal" hanya 23 jam, jadi rollover berbasis setDate memundurkan cron ke
  // 02:00 WIB — senyap, tidak ada error. TZ harus diset sebelum Node start,
  // karena itu diuji lewat proses anak.
  const moduleUrl = new URL('../lib/background-jobs.js', import.meta.url).href;
  const script = `
    import(${JSON.stringify(moduleUrl)}).then(({ msUntilNextWibHour }) => {
      const now = new Date('2026-03-07T21:00:00Z'); // malam sebelum DST US
      const fire = new Date(now.getTime() + msUntilNextWibHour(3, now));
      process.stdout.write(new Date(fire.getTime() + 7 * 3600e3).toISOString().slice(11, 19));
    });
  `;
  const wibClock = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
  });
  assert.equal(wibClock, '03:00:00');
});
