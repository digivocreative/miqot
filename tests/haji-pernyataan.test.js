import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPaketDetail } from '../haji-api.js';

test('extractPaketDetail: real-world "Non Arbain ~ UHUD Quard"', () => {
  const html = '<table><tr><td>PAKET HAJI</td><td>Non Arbain ~ UHUD Quard</td></tr></table>';
  const r = extractPaketDetail(html);
  assert.match(r, /UHUD/i);
});

test('extractPaketDetail: "Arbain ~ RAHMAH"', () => {
  const html = '... Arbain ~ RAHMAH ...';
  const r = extractPaketDetail(html);
  assert.match(r, /RAHMAH/i);
});

test('extractPaketDetail: bare UHUD without arbain marker', () => {
  const html = '<p>Paket Haji UHUD</p>';
  const r = extractPaketDetail(html);
  assert.match(r, /UHUD/i);
});

test('extractPaketDetail: returns null when no match', () => {
  assert.equal(extractPaketDetail('<p>nothing here</p>'), null);
});

test('extractPaketDetail: handles null/undefined/empty', () => {
  assert.equal(extractPaketDetail(null), null);
  assert.equal(extractPaketDetail(undefined), null);
  assert.equal(extractPaketDetail(''), null);
});

test('extractPaketDetail: stops at HTML tag boundary', () => {
  const html = 'Non Arbain ~ UHUD</td><td>blah';
  const r = extractPaketDetail(html);
  assert.match(r, /^UHUD/);
  assert.doesNotMatch(r, /<|td|blah/);
});
