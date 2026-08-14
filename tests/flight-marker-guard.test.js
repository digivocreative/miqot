import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');
const sharePage = readFileSync(new URL('../src/components/FlightSharePage.tsx', import.meta.url), 'utf8');
const publicShareHandler = server.slice(
  server.indexOf("app.get('/api/flight-share/:code'"),
  server.indexOf('// ──────────────────────────────────────────────\n// Haji Plus API'),
);
const flightPoller = server.slice(
  server.indexOf('async function pollActiveFlights()'),
  server.indexOf('function dateOnly(date)'),
);

/**
 * Ambil satu fungsi top-level UTUH: dari penanda sampai '}' di kolom 0. Bukan
 * hitungan baris — tubuh yang memanjang akan menggeser baris terjaga ke luar
 * jendela dan penjaganya lolos diam-diam.
 */
function sliceFunction(marker) {
  const index = server.indexOf(marker);
  assert.notEqual(index, -1, `penanda tidak ditemukan di server.js: ${marker}`);
  const end = server.indexOf('\n}\n', index);
  assert.notEqual(end, -1, `akhir fungsi tidak ditemukan untuk penanda: ${marker}`);
  return server.slice(index, end);
}

test('server never substitutes midnight when marker timing is unknown', () => {
  assert.doesNotMatch(
    server,
    /deriveCalendarFlightTimes\(\{\s*\.\.\.event,\s*jam:\s*['"]00:00['"]\s*\}/,
  );
  assert.match(server, /computeFallbackFlightState\(/);
  assert.doesNotMatch(server, /calendarEvent\.jam \|\| ['"]00:00['"]/);
  assert.doesNotMatch(server, /fallbackStatus\s*=\s*['"]en-route['"]/);
});

test('anchor leg clock is trusted for multi-leg chains, intermediate legs are not', () => {
  // operationalTimeTrusted follows the anchor flag (operationalDateTrusted):
  // single-leg, or first-leg departure (keberangkatan) / last-leg arrival (kepulangan).
  assert.match(server, /operationalTimeTrusted: operationalDateTrusted/);
  assert.doesNotMatch(server, /operationalTimeTrusted: chain\.length === 1/);
});

test('calendar airport enrichment and flight cards select the calendar-reported marker leg', () => {
  assert.match(server, /const dayOffset = calendarDayOffsetForEvent\(event, schedule\)/);
  assert.match(server, /dayOffset !== null[\s\S]*selectCalendarReportedSegments/);
  assert.match(server, /operationalFlightDate\(/);
  assert.match(server, /shouldPollFlight\(segment\.flightDate, event\.event_type\)/);
});

test('marker operational date keys cache, status cards, and polling consistently', () => {
  assert.match(server, /const flightId = `\$\{segment\.flightDate\}_\$\{segment\.flightIata\}`/);
  assert.match(server, /shouldPollFlight\(segment\.flightDate, event\.event_type\)/);
  assert.match(server, /providerFlightMatchesSegment\(apiData, flightSegment\)/);
});

test('poller abandons a provider record frozen mid-flight instead of re-stamping it', () => {
  // The 5-minute en-route interval kept polling SV819 long after AirLabs stopped
  // updating it, refreshing synced_at on dead evidence and burning quota.
  assert.ok(flightPoller.length > 0, 'pollActiveFlights slice must not be empty');
  assert.match(flightPoller, /isExpiredActiveProviderClaim\(existing\)/);
  assert.match(server, /isExpiredActiveProviderClaim,[\s\S]*from '\.\/lib\/flight-provider-freshness\.js'/);
});

test('cache penerbangan membawa bukti provider utuh, bukan jam berangkat saja', () => {
  // getCachedFlight MEMBANGUN ULANG baris provider tiap pembacaan lalu menimpa
  // `status`. Selama proyeksinya cuma `dep_time_ts`, `updated` dan kedua stempel
  // kedatangan hilang di jalur cache: kedua penjaga rekaman beku tak bersenjata
  // dan 'unverified' hasil formatFlightForFrontend hidup lagi jadi 'en-route'.
  const cacheWrite = sliceFunction('function setCachedFlight(');
  const cacheRead = sliceFunction('function getCachedFlight(');

  assert.match(cacheWrite, /providerRaw: projectProviderEvidence\(providerRow\?\.raw_api\)/);
  assert.match(cacheRead, /raw_api: cached\.providerRaw/);
  // Proyeksi lossy lama tak boleh kembali lewat pintu mana pun.
  assert.doesNotMatch(cacheRead, /dep_time_ts: cached\./);
  assert.doesNotMatch(cacheWrite, /providerDepTs:/);
  assert.match(server, /projectProviderEvidence,[\s\S]*from '\.\/lib\/flight-provider-freshness\.js'/);
});

test('flight status UI uses provider-backed normalized labels without a redundant header badge', () => {
  assert.match(card, /getFlightStatusPresentation\(summaryFlight\.status\)/);
  assert.match(card, /\{sc\.label\}/);
  assert.match(server, /is_live: isLive/);
  assert.match(sharePage, /getFlightStatusPresentation\(currentFlightStatus\)/);
  assert.match(sharePage, /\{status\.label\}/);
  assert.doesNotMatch(sharePage, /flight\.is_live|liveBreathe|liveRipple/);
});

test('share regeneration refreshes route and derives SV from flight number', () => {
  assert.match(server, /\.update\(\{[\s\S]*dep_iata, arr_iata, dep_city, arr_city/);
  assert.match(card, /flight\.flightNumber\?\.replace\(\/\\s\+\/g, ''\)\.match/);
});

test('public share enrichment expires schedule claims and never overwrites its base snapshot', () => {
  assert.match(publicShareHandler, /scheduledSnapshotDisplayStatus\(snapshotDepUTC\)/);
  assert.doesNotMatch(publicShareHandler, /\.from\('flight_shares'\)[\s\S]*\.update\(/);
});
