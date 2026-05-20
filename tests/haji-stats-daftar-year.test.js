import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const server = readFileSync(join(root.pathname, 'server.js'), 'utf8');
const hajiStatsSection = readFileSync(join(root.pathname, 'src/components/StatistikHajiSection.tsx'), 'utf8');
const statistikPage = readFileSync(join(root.pathname, 'src/components/StatistikPage.tsx'), 'utf8');

test('haji stats endpoint supports registration year filtering', () => {
  assert.match(server, /requestedDaftarYear/);
  assert.match(server, /requestedMode = req\.query\.mode === 'pendaftaran' \? 'pendaftaran' : 'keberangkatan'/);
  assert.match(server, /cacheKey = `haji:\$\{agentId\}:\$\{requestedMode\}:\$\{requestedYear\}:\$\{requestedDaftarYear\}`/);
  assert.match(server, /if \(!year && !daftarYear\)/);
  assert.match(server, /requestedMode === 'pendaftaran'/);
  assert.match(server, /daftarYear = pickDefaultYear\(daftarYears, new Date\(\)\.getFullYear\(\)\)/);
  assert.match(server, /gte\('tgl_daftar', `\$\{daftarYear\}-01-01`\)/);
  assert.match(server, /lt\('tgl_daftar', `\$\{Number\(daftarYear\) \+ 1\}-01-01`\)/);
  assert.match(server, /daftarYear,/);
});

test('haji statistics section exposes mode tabs and sends the selected year to the matching API filter', () => {
  assert.match(hajiStatsSection, /daftarYears: string\[\]/);
  assert.match(hajiStatsSection, /type HajiStatsMode = 'pendaftaran' \| 'keberangkatan'/);
  assert.match(hajiStatsSection, /mode === 'pendaftaran'/);
  assert.match(hajiStatsSection, /params\.set\('mode', mode\)/);
  assert.match(hajiStatsSection, /params\.set\('daftar_year', yr\)/);
  assert.match(hajiStatsSection, /params\.set\('year', yr\)/);
  assert.match(hajiStatsSection, /json\.data\.daftarYear \|\| pendaftaran\[0\]/);
  assert.match(hajiStatsSection, /Pendaftaran/);
  assert.match(hajiStatsSection, /Keberangkatan/);
  assert.doesNotMatch(hajiStatsSection, /selectedDaftarYear|setSelectedDaftarYear|Tahun Daftar|Semua Daftar/);
});

test('haji statistics parent header uses the active haji mode year list', () => {
  assert.match(statistikPage, /const \[hajiStatsMode, setHajiStatsMode\]/);
  assert.match(statistikPage, /useState<'pendaftaran' \| 'keberangkatan'>\('pendaftaran'\)/);
  assert.match(statistikPage, /const \[hajiDaftarYears, setHajiDaftarYears\]/);
  assert.match(statistikPage, /const hajiHeaderYears = hajiStatsMode === 'pendaftaran' \? hajiDaftarYears : hajiAvailableYears/);
  assert.match(statistikPage, /const handleHajiStatsModeChange = useCallback/);
  assert.match(statistikPage, /onModeChange=\{handleHajiStatsModeChange\}/);
});

test('haji statistics parent picks the nearest masehi year instead of the first descending year', () => {
  assert.match(statistikPage, /function pickNearestMasehiYear/);
  assert.match(statistikPage, /setSelectedYearMasehi\(pickNearestMasehiYear\(hajiHeaderYears\)\)/);
  assert.match(statistikPage, /setSelectedYearMasehi\(pickNearestMasehiYear\(nextYears\)\)/);
  assert.doesNotMatch(statistikPage, /setSelectedYearMasehi\(hajiHeaderYears\[0\]\)/);
});

test('haji stats ignores stale stats responses', () => {
  assert.match(hajiStatsSection, /statsRequestSeqRef/);
  assert.match(hajiStatsSection, /requestId !== statsRequestSeqRef\.current/);
});
