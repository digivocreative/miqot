import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

function routeDuration(flightIata) {
  const re = new RegExp(`'${flightIata}'\\s*:\\s*\\{[^}]*durationMin:\\s*(\\d+)`, 'm');
  const match = serverSource.match(re);
  return match ? Number(match[1]) : null;
}

function routeOf(flightIata) {
  const re = new RegExp(`'${flightIata}'\\s*:\\s*\\{([^}]*)\\}`, 'm');
  const match = serverSource.match(re);
  if (!match) return null;
  const body = match[1];
  const str = (field) => body.match(new RegExp(`${field}:\\s*'([^']*)'`))?.[1] ?? null;
  return {
    dep: str('dep'),
    arr: str('arr'),
    depCity: str('depCity'),
    arrCity: str('arrCity'),
    durationMin: routeDuration(flightIata),
  };
}

test('SV827 fallback schedule is 00:40 CGK to 06:10 JED', () => {
  assert.equal(routeDuration('SV827'), 570);
});

test('SV818 fallback schedule is 01:55 JED to 16:00 CGK', () => {
  assert.equal(routeDuration('SV818'), 605);
});

test('EK357 fallback route is Jakarta to Dubai, not the full itinerary to Jeddah', () => {
  assert.deepEqual(routeOf('EK357'), {
    dep: 'CGK',
    arr: 'DXB',
    depCity: 'Jakarta',
    arrCity: 'Dubai',
    durationMin: 470,
  });
});

test('EK802 fallback route is Jeddah to Dubai for the first return segment', () => {
  assert.deepEqual(routeOf('EK802'), {
    dep: 'JED',
    arr: 'DXB',
    depCity: 'Jeddah',
    arrCity: 'Dubai',
    durationMin: 170,
  });
});

test('EK358 fallback route is Dubai to Jakarta', () => {
  assert.deepEqual(routeOf('EK358'), {
    dep: 'DXB',
    arr: 'CGK',
    depCity: 'Dubai',
    arrCity: 'Jakarta',
    durationMin: 515,
  });
});
