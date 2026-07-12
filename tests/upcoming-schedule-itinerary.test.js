import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const schedulePage = readFileSync(new URL('../src/components/UpcomingSchedule.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('calendar API returns the matched schedule itinerary using the versioned CDN URL', () => {
  assert.match(server, /'itinerary_cdn'/);
  assert.match(server, /'itinerary_source_sha256'/);
  assert.match(server, /appendUrlVersion\(schedule\.itinerary_cdn, schedule\.itinerary_source_sha256\)/);
  assert.match(server, /jadwal_id: ev\.jadwal_id \|\| null/);
  assert.match(server, /itinerary_url: itineraryUrl/);
});

test('upcoming departure card places ITINERARY above PAX and opens the shared modal', () => {
  assert.match(schedulePage, /const ItineraryModal = lazy/);
  assert.match(schedulePage, /flex flex-shrink-0 flex-col items-end/);
  const itineraryPosition = schedulePage.indexOf('ITINERARY');
  const paxPosition = schedulePage.indexOf('{displayPax(detail)}');
  assert.ok(itineraryPosition >= 0 && itineraryPosition < paxPosition);
  assert.match(schedulePage, /ITINERARY[\s\S]*<div className="mt-auto">[\s\S]*\{displayPax\(detail\)\}/);
  assert.match(schedulePage, /<FileText size=\{9\} strokeWidth=\{2\.5\} \/>[\s\S]*ITINERARY/);
  assert.match(schedulePage, /setActiveItinerary\(\{/);
  assert.match(schedulePage, /<ItineraryModal[\s\S]*fileUrl=\{activeItinerary\.url\}/);
});

test('take-off row uses the take-off icon instead of a location pin', () => {
  const takeOffBlock = schedulePage.match(/<span>Take off<\/span>[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(schedulePage, /PlaneTakeoff/);
  assert.match(takeOffBlock, /<PlaneTakeoff/);
  assert.doesNotMatch(takeOffBlock, /<MapPin/);
});
