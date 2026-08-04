import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('calendar-api no longer uses legacy calendar login or credentials', () => {
  const src = readFileSync(new URL('../calendar-api.js', import.meta.url), 'utf8');
  const forbidden = [
    'CALENDAR_USERNAME',
    'CALENDAR_PASSWORD',
    'CALENDAR_KANTOR',
    'INTERNAL_API_BASE',
    'loginInternal',
    'cek_login.php',
    'pages/main.php?route=home',
    'pages/_jmodal.php',
    'buildCookieString',
    'isSessionExpiredHtml',
  ];

  for (const text of forbidden) {
    assert.doesNotMatch(src, new RegExp(escapeRegExp(text)), `calendar-api.js still contains ${text}`);
  }

  assert.match(src, /fetchPublicCalendarEvents/);
  assert.match(src, /fetchPublicEventDetail/);
});

test('calendar ops alert points to public calendar source instead of legacy credentials', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const calendarSection = src.slice(src.indexOf('// ── Calendar sync:'), src.indexOf('// ── Itinerary background sync:'));

  assert.doesNotMatch(calendarSection, /kredensial kalender|login legacy|server legacy down/);
  assert.match(calendarSection, /halaman publik kegiatan/);
  assert.match(calendarSection, /_kmodal\.php/);
});

test('calendar sync supervisor persists durable health and prevents overlapping runs', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const calendarSection = src.slice(src.indexOf('// ── Calendar sync:'), src.indexOf('// ── Itinerary background sync:'));

  assert.match(calendarSection, /calendarSyncRunning/);
  assert.match(calendarSection, /calendarSyncPendingAttempt/);
  assert.match(calendarSection, /drainQueuedCalendarSync/);
  assert.match(calendarSection, /Sync masih berjalan; trigger berikutnya diantrikan/);
  assert.match(calendarSection, /await persistCalendarSyncHealth/);
  assert.match(calendarSection, /last_rows_upserted/);
  assert.match(calendarSection, /last_events_succeeded/);
  assert.match(calendarSection, /last_mutawif_reader_failures/);
  assert.match(calendarSection, /last_mutawif_regressions_prevented/);
  assert.match(calendarSection, /calendarSyncHealthState\.alerted === true/);
  assert.match(calendarSection, /last_full_success_at/);
  assert.match(calendarSection, /last_degraded_at/);
  assert.match(calendarSection, /last_degraded_error/);
  assert.match(calendarSection, /scheduleCalendarPrimaryProbe/);
  assert.match(calendarSection, /probePublicCalendarPrimary/);
  assert.match(calendarSection, /last_primary_probe_error/);
  assert.match(calendarSection, /jalur Reader MUTAWIF/);

  const startupSyncs = calendarSection.match(/setTimeout\(runCalendarSync, 60 \* 1000\)/g) || [];
  assert.equal(startupSyncs.length, 1, 'calendar startup sync must only be scheduled once');
});

test('calendar MUTAWIF relay stays enabled with a six-month protection window', () => {
  const apiSrc = readFileSync(new URL('../calendar-api.js', import.meta.url), 'utf8');
  const sourceSrc = readFileSync(new URL('../lib/calendar-public-source.js', import.meta.url), 'utf8');
  const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

  assert.match(apiSrc, /CALENDAR_PUBLIC_MUTAWIF_READER_DAYS[\s\S]*?180/);
  assert.match(sourceSrc, /\? 'https:\/\/r\.jina\.ai'/);
  assert.match(envExample, /^CALENDAR_PUBLIC_MUTAWIF_READER_DAYS=180$/m);
  assert.match(envExample, /^CALENDAR_PUBLIC_READER_MIN_INTERVAL_MS=3200$/m);
});
