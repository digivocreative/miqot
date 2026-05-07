import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBrochurePrice } from '../lib/brochure-schedule.js';

test('pickBrochurePrice: single hotel tier with Quard', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 33900000, Triple: 35000000, Double: 38000000, Infant: 5000000 } };
  assert.equal(pickBrochurePrice(harga), 33900000);
});

test('pickBrochurePrice: multiple hotel tiers picks min Quard', () => {
  const harga = {
    'Hotel Bintang 5': { Quard: 38000000, Triple: 40000000 },
    'Hotel Bintang 4': { Quard: 33900000, Triple: 35500000 },
  };
  assert.equal(pickBrochurePrice(harga), 33900000);
});

test('pickBrochurePrice: no Quard, falls back to Triple', () => {
  const harga = { 'Hotel Bintang 5': { Triple: 35000000, Double: 38000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});

test('pickBrochurePrice: Quard=0 treated as missing, falls back to Triple', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 0, Triple: 35000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});

test('pickBrochurePrice: skips Infant entirely', () => {
  const harga = { 'Hotel Bintang 5': { Infant: 5000000 } };
  assert.equal(pickBrochurePrice(harga), null);
});

test('pickBrochurePrice: null/undefined input returns null', () => {
  assert.equal(pickBrochurePrice(null), null);
  assert.equal(pickBrochurePrice(undefined), null);
  assert.equal(pickBrochurePrice({}), null);
});

test('pickBrochurePrice: non-numeric string price ignored', () => {
  const harga = { 'Hotel Bintang 5': { Quard: 'tba', Triple: 35000000 } };
  assert.equal(pickBrochurePrice(harga), 35000000);
});
