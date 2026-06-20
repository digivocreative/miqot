import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

function routeDuration(flightIata) {
  const re = new RegExp(`'${flightIata}'\\s*:\\s*\\{[^}]*durationMin:\\s*(\\d+)`, 'm');
  const match = serverSource.match(re);
  return match ? Number(match[1]) : null;
}

test('SV827 fallback schedule is 00:40 CGK to 06:10 JED', () => {
  assert.equal(routeDuration('SV827'), 570);
});

test('SV818 fallback schedule is 01:55 JED to 16:00 CGK', () => {
  assert.equal(routeDuration('SV818'), 605);
});
