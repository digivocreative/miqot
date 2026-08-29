import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  parseHajiPlusChartData,
  parseHajiPlusTableData,
  parseHajiPlusStatsHtml,
  isHajiPlusRows,
  activeSpan,
  summarizeHajiPlusSeries,
  buildHajiPlusPayload,
} from '../lib/haji-plus-stats.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(resolve(here, 'fixtures/grafik-haji-khusus.html'), 'utf-8');

// Angka acuan diambil langsung dari halaman publik (snapshot 2026-08-29).
const EXPECTED_FIRST = { year: 2016, terdaftar: 44, berangkat: 9 };
const EXPECTED_2026 = { year: 2026, terdaftar: 745, berangkat: 482 };
const EXPECTED_LAST = { year: 2037, terdaftar: 0, berangkat: 85 };

test('parseHajiPlusChartData membaca kedua seri dari variabel Chart.js', () => {
  const rows = parseHajiPlusChartData(FIXTURE);
  assert.equal(rows.length, 22);
  assert.deepEqual(rows[0], EXPECTED_FIRST);
  assert.deepEqual(rows.find((r) => r.year === 2026), EXPECTED_2026);
  assert.deepEqual(rows[21], EXPECTED_LAST);
});

test('parseHajiPlusTableData memberi hasil identik dengan sumber JS', () => {
  // Tabel memakai pemisah ribuan ("1,027") — kalau pembersihannya salah,
  // 1027 akan terbaca 1 dan asersi ini gugur.
  assert.deepEqual(parseHajiPlusTableData(FIXTURE), parseHajiPlusChartData(FIXTURE));
  assert.equal(parseHajiPlusTableData(FIXTURE).find((r) => r.year === 2023).terdaftar, 1773);
  assert.equal(parseHajiPlusTableData(FIXTURE).find((r) => r.year === 2022).terdaftar, 1027);
});

test('parseHajiPlusStatsHtml jatuh ke tabel saat variabel Chart.js hilang', () => {
  const withoutScript = FIXTURE.replace(/<script[\s\S]*?<\/script>/gi, '');
  assert.equal(parseHajiPlusChartData(withoutScript), null);
  assert.deepEqual(parseHajiPlusStatsHtml(withoutScript), parseHajiPlusChartData(FIXTURE));
});

test('parseHajiPlusStatsHtml menyerah (null) kalau kedua sumber hilang', () => {
  const gutted = FIXTURE
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/gi, '');
  assert.equal(parseHajiPlusStatsHtml(gutted), null);
  assert.equal(parseHajiPlusStatsHtml(''), null);
  assert.equal(parseHajiPlusStatsHtml(null), null);
});

test('parseHajiPlusChartData menolak seluruh payload kalau satu entri rusak', () => {
  const corrupted = FIXTURE.replace('"tahun":2024,"terdaftar":1078', '"tahun":2024,"terdaftar":"n/a"');
  assert.equal(parseHajiPlusChartData(corrupted), null);
});

test('isHajiPlusRows menolak baris warisan {year, pax}', () => {
  assert.equal(isHajiPlusRows([{ year: 2026, pax: 745 }]), false);
  assert.equal(isHajiPlusRows([{ year: 2026, terdaftar: 745, berangkat: 482 }]), true);
  assert.equal(isHajiPlusRows([]), false);
  assert.equal(isHajiPlusRows(null), false);
});

test('activeSpan memangkas ekor nol terdaftar tapi menyimpan nol pandemi berangkat', () => {
  const rows = parseHajiPlusStatsHtml(FIXTURE);

  const terdaftar = activeSpan(rows, 'terdaftar');
  assert.deepEqual([terdaftar[0].year, terdaftar[terdaftar.length - 1].year], [2016, 2026]);

  const berangkat = activeSpan(rows, 'berangkat');
  assert.deepEqual([berangkat[0].year, berangkat[berangkat.length - 1].year], [2016, 2037]);
  // 2020 & 2021 nol (pandemi) berada di tengah rentang → wajib ikut terbawa.
  assert.deepEqual(
    berangkat.filter((r) => r.berangkat === 0).map((r) => r.year),
    [2020, 2021],
  );
});

test('summarizeHajiPlusSeries menghitung di rentang aktif, bukan 22 tahun mentah', () => {
  const rows = parseHajiPlusStatsHtml(FIXTURE);
  const t = summarizeHajiPlusSeries(rows, 'terdaftar', 2026);

  assert.equal(t.yearCount, 11);
  assert.equal(t.total, 44 + 88 + 71 + 72 + 58 + 215 + 1027 + 1773 + 1078 + 960 + 745);
  assert.deepEqual(t.peak, { year: 2023, pax: 1773 });
  // Kalau rentangnya tidak dipangkas, min-nya jadi 0 @2027 — bukan 44 @2016.
  assert.deepEqual(t.min, { year: 2016, pax: 44 });
  assert.deepEqual(t.current, { year: 2026, pax: 745 });
  assert.equal(t.scheduled, 0);

  const b = summarizeHajiPlusSeries(rows, 'berangkat', 2026);
  assert.equal(b.yearCount, 22);
  assert.deepEqual(b.peak, { year: 2028, pax: 1449 });
  assert.deepEqual(b.current, { year: 2026, pax: 482 });
  assert.equal(b.realized, 9 + 34 + 9 + 3 + 0 + 0 + 18 + 28 + 149 + 135 + 482);
  assert.equal(b.scheduled, b.total - b.realized);
  assert.ok(b.scheduled > 0, 'berangkat 2027+ adalah alokasi terjadwal, tidak boleh nol');
});

test('summarizeHajiPlusSeries mengembalikan null saat seri kosong seluruhnya', () => {
  const rows = [{ year: 2026, terdaftar: 0, berangkat: 0 }];
  assert.equal(summarizeHajiPlusSeries(rows, 'terdaftar', 2026), null);
});

test('buildHajiPlusPayload menyusun dua seri + tahun sync', () => {
  const rows = parseHajiPlusStatsHtml(FIXTURE);
  const payload = buildHajiPlusPayload(rows, '2026-08-29T00:00:00.000Z', new Date('2026-08-29T00:00:00Z'));

  assert.deepEqual(Object.keys(payload.series).sort(), ['berangkat', 'terdaftar']);
  assert.equal(payload.yearCount, 22);
  assert.deepEqual([payload.firstYear, payload.lastYear], [2016, 2037]);
  assert.equal(payload.synced_at, '2026-08-29T00:00:00.000Z');
  assert.equal(payload.series.terdaftar.label, 'Jamaah Terdaftar');
  assert.equal(payload.series.berangkat.label, 'Jamaah Berangkat');
});

test('buildHajiPlusPayload menolak payload warisan satu-seri', () => {
  assert.equal(buildHajiPlusPayload([{ year: 2026, pax: 745 }], null), null);
});
