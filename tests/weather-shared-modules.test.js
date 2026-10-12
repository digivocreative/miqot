import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_CITIES, CUACA_SHARE_CITY_META } from '../lib/weather-cities.js';
import { SEASONAL_NOTES } from '../lib/weather-seasonal-notes.js';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const widget = readFileSync(new URL('../src/components/CuacaWidget.tsx', import.meta.url), 'utf8');

test('weather cities keep the canonical tab order and timezones', () => {
  assert.deepEqual(WEATHER_CITIES.map(c => c.key), ['makkah', 'madinah', 'istanbul', 'cappadocia', 'dubai', 'hainan']);
  assert.equal(WEATHER_CITIES.find(c => c.key === 'makkah').tz, 'Asia/Riyadh');
  assert.equal(WEATHER_CITIES.find(c => c.key === 'hainan').tz, 'Asia/Shanghai');
});

test('every city has banner meta and twelve seasonal notes', () => {
  for (const { key } of WEATHER_CITIES) {
    assert.ok(CUACA_SHARE_CITY_META[key], `meta ${key}`);
    assert.equal(SEASONAL_NOTES[key]?.length, 12, `notes ${key}`);
  }
  assert.equal(CUACA_SHARE_CITY_META.hainan.photo, null);
  assert.equal(CUACA_SHARE_CITY_META.makkah.trip, 'umroh');
  assert.equal(CUACA_SHARE_CITY_META.dubai.trip, 'wisata');
  assert.equal(SEASONAL_NOTES.makkah[9], 'Oktober nyaman untuk siang — mulai cocok aktivitas di luar.');
});

test('server and widget import the shared modules instead of inline copies', () => {
  assert.match(server, /import \{ WEATHER_CITIES \} from '\.\/lib\/weather-cities\.js';/);
  assert.doesNotMatch(server, /const WEATHER_CITIES = \[/);
  assert.match(widget, /import \{ SEASONAL_NOTES \} from '\.\.\/\.\.\/lib\/weather-seasonal-notes\.js';/);
  assert.doesNotMatch(widget, /const SEASONAL_NOTES/);
});

test('daily forecast entries carry their WMO weather code', () => {
  assert.match(server, /icon: wmoMap\(daily\.weather_code\[i \+ 1\]\)\.icon,\n\s+weatherCode: daily\.weather_code\[i \+ 1\],/);
});
