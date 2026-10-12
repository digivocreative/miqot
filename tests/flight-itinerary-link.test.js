import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightItineraryFields, flightCardItineraries } from '../lib/flight-itinerary-link.js';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/DashboardLayout.tsx', import.meta.url), 'utf8');

test('flight entry links the CDN itinerary of its jadwal, versioned by sha', () => {
  assert.deepEqual(
    flightItineraryFields(
      { jadwal_id: 'JBU1525', paket: '30/08/2026 PLUS REDSEA PAKET RAHMAH 9HR' },
      {
        jadwal_id: 'JBU1525',
        jadwal_nama: 'Nama jadwal',
        itinerary: 'https://origin.example/it.pdf',
        itinerary_cdn: 'https://cdn.example/it.pdf',
        itinerary_source_sha256: 'abcdef0123456789abcdef',
      },
    ),
    {
      jadwalId: 'JBU1525',
      itineraryUrl: 'https://cdn.example/it.pdf?v=abcdef0123456789',
      itineraryTitle: 'PLUS REDSEA PAKET RAHMAH 9HR',
    },
  );
});

test('flight entry falls back to the origin itinerary and the jadwal name', () => {
  assert.deepEqual(
    flightItineraryFields(
      { jadwal_id: 'JBU1', paket: null },
      { jadwal_id: 'JBU1', jadwal_nama: 'REGULER 9HR', itinerary: 'https://origin.example/it.pdf' },
    ),
    { jadwalId: 'JBU1', itineraryUrl: 'https://origin.example/it.pdf', itineraryTitle: 'REGULER 9HR' },
  );
});

test('flight entry without schedule or itinerary carries no link', () => {
  assert.deepEqual(
    flightItineraryFields({ jadwal_id: 'JBU2', paket: 'X' }, null),
    { jadwalId: 'JBU2', itineraryUrl: null, itineraryTitle: 'X' },
  );
  assert.equal(flightItineraryFields({ jadwal_id: null }, undefined).itineraryUrl, null);
});

test('card itineraries are one per distinct link, labelled by kloter', () => {
  assert.deepEqual(
    flightCardItineraries([
      { id: 'a', group: '27', jadwalId: 'J1', itineraryUrl: 'u1', itineraryTitle: 'PAKET A' },
      { id: 'b', group: '28', jadwalId: 'J2', itineraryUrl: 'u2', itineraryTitle: 'PAKET B' },
      { id: 'c', group: '29', jadwalId: 'J1', itineraryUrl: 'u1', itineraryTitle: 'PAKET A' },
      { id: 'd', group: '30', jadwalId: 'J3', itineraryUrl: null, itineraryTitle: 'PAKET C' },
    ]),
    [
      { key: 'u1', url: 'u1', jadwalId: 'J1', title: 'PAKET A', group: '27' },
      { key: 'u2', url: 'u2', jadwalId: 'J2', title: 'PAKET B', group: '28' },
    ],
  );
  assert.deepEqual(flightCardItineraries([{ id: 'x', group: '1' }]), []);
});

test('both flight entry builders attach itinerary fields', () => {
  const route = server.slice(server.indexOf("app.get('/api/flights/status'"));
  const body = route.slice(0, route.indexOf("res.json({ success: true, data: filtered })"));
  assert.equal(body.match(/\.\.\.flightItineraryFields\(event, scheduleById\.get\(String\(event\.jadwal_id\)\)\)/g)?.length, 2);
});

test('flight detail shows Itinerary beside Share and opens the itinerary modal', () => {
  assert.match(card, /const itineraries = flightCardItineraries\(group\)/);
  assert.match(card, />Copy Link<\/>[\s\S]*<FileText size=\{13\}[\s\S]*Itinerary/);
  assert.match(card, /<ItineraryModal[\s\S]*fileUrl=\{activeItinerary\.url\}[\s\S]*jadwalId=\{activeItinerary\.jadwalId\}[\s\S]*agentSlug=\{agentSlug\}/);
  assert.match(card, /trackEvent\('action', 'download_itinerary', \{ source: 'flight'/);
  assert.match(dashboard, /<FlightStatusCard onFlightCount=\{setFlightCount\} agentSlug=\{agentData\.slug\} \/>/);
});
