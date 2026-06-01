import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacyDmyDate } from '../lib/legacy-date-parse.js';

// Regression guard for the Dec("Des")->Jan corruption: the legacy laporan HTML
// renders Indonesian month tokens ("Des"/"Desember"), which the old English-only
// month map silently mapped to "01" (January), pushing Dec-2026 (hijriah 1448)
// jamaah into 1447. parseLegacyDmyDate must resolve both languages and fail safe
// to null for unknown tokens — never a fabricated January date.

test('Indonesian December tokens resolve to month 12 (the bug being fixed)', () => {
  assert.equal(parseLegacyDmyDate('26 Des 2026'), '2026-12-26');
  assert.equal(parseLegacyDmyDate('26 DES 2026'), '2026-12-26');
  assert.equal(parseLegacyDmyDate('26 Desember 2026'), '2026-12-26');
  assert.equal(parseLegacyDmyDate('21 DES 2026'), '2026-12-21');
  assert.equal(parseLegacyDmyDate('28 desember 2026'), '2026-12-28');
});

test('English December tokens still resolve to month 12', () => {
  assert.equal(parseLegacyDmyDate('26 Dec 2026'), '2026-12-26');
  assert.equal(parseLegacyDmyDate('26 DEC 2026'), '2026-12-26');
  assert.equal(parseLegacyDmyDate('26 December 2026'), '2026-12-26');
});

test('non-December months are unaffected (English + Indonesian)', () => {
  assert.equal(parseLegacyDmyDate('26 Jun 2026'), '2026-06-26');
  assert.equal(parseLegacyDmyDate('13 JUN 2026'), '2026-06-13');
  assert.equal(parseLegacyDmyDate('10 Oct 2026'), '2026-10-10');
  assert.equal(parseLegacyDmyDate('10 Okt 2026'), '2026-10-10');
  assert.equal(parseLegacyDmyDate('5 Mei 2026'), '2026-05-05');
  assert.equal(parseLegacyDmyDate('5 May 2026'), '2026-05-05');
  assert.equal(parseLegacyDmyDate('15 Agt 2026'), '2026-08-15');
  assert.equal(parseLegacyDmyDate('15 Agustus 2026'), '2026-08-15');
  assert.equal(parseLegacyDmyDate('1 Nov 2026'), '2026-11-01');
  assert.equal(parseLegacyDmyDate('1 Nopember 2026'), '2026-11-01');
});

test('all twelve Indonesian months map correctly', () => {
  const expected = {
    'Januari': '01', 'Februari': '02', 'Maret': '03', 'April': '04',
    'Mei': '05', 'Juni': '06', 'Juli': '07', 'Agustus': '08',
    'September': '09', 'Oktober': '10', 'November': '11', 'Desember': '12',
  };
  for (const [name, mm] of Object.entries(expected)) {
    assert.equal(parseLegacyDmyDate(`07 ${name} 2026`), `2026-${mm}-07`, `failed for ${name}`);
  }
});

test('unknown / malformed tokens return null, never a fabricated January date', () => {
  assert.equal(parseLegacyDmyDate('26 XYZ 2026'), null);
  assert.equal(parseLegacyDmyDate(''), null);
  assert.equal(parseLegacyDmyDate(null), null);
  assert.equal(parseLegacyDmyDate(undefined), null);
  assert.equal(parseLegacyDmyDate('garbage'), null);
  assert.equal(parseLegacyDmyDate('2026-12-26'), null); // not the DD MMM YYYY shape
});
