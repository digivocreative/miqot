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
