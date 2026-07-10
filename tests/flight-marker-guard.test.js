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

test('server never substitutes midnight when marker timing is unknown', () => {
  assert.doesNotMatch(
    server,
    /deriveCalendarFlightTimes\(\{\s*\.\.\.event,\s*jam:\s*['"]00:00['"]\s*\}/,
  );
  assert.match(server, /computeFallbackFlightState\(/);
  assert.doesNotMatch(server, /calendarEvent\.jam \|\| ['"]00:00['"]/);
  assert.doesNotMatch(server, /fallbackStatus\s*=\s*['"]en-route['"]/);
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

test('flight status header only says Live when provider-backed rows exist', () => {
  assert.match(card, /const hasLiveTracking = flights\.some/);
  assert.match(card, /hasLiveTracking \? \(/);
  assert.match(card, /hasUnverified \? 'Perlu Cek'/);
  assert.match(server, /is_live: isLive/);
  assert.match(sharePage, /flight\.is_live \? \(/);
  assert.match(sharePage, /flight\.flight_status === 'unverified'[\s\S]*\? 'PERLU CEK'/);
});

test('share regeneration refreshes route and derives SV from flight number', () => {
  assert.match(server, /\.update\(\{[\s\S]*dep_iata, arr_iata, dep_city, arr_city/);
  assert.match(card, /flight\.flightNumber\?\.replace\(\/\\s\+\/g, ''\)\.match/);
});

test('public share enrichment expires schedule claims and never overwrites its base snapshot', () => {
  assert.match(publicShareHandler, /scheduledSnapshotDisplayStatus\(snapshotDepUTC\)/);
  assert.doesNotMatch(publicShareHandler, /\.from\('flight_shares'\)[\s\S]*\.update\(/);
});
