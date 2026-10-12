// Link itinerary untuk kartu Status Penerbangan.
//
// Sisi server menempelkan itinerary jadwal (umroh_schedules) ke tiap entri
// kloter; sisi klien merangkum entri satu kartu menjadi daftar link unik.
// Satu penerbangan bisa membawa beberapa kloter dari jadwal berbeda (±10%
// kartu), jadi kartu bisa punya lebih dari satu itinerary.

import { appendUrlVersion } from './umroh-schedules.js';

// Kolom paket kalender kadang diawali tanggal berangkat "DD/MM/YYYY ".
const PAKET_DATE_PREFIX = /^\d{2}\/\d{2}\/\d{4}\s*/;

export function flightItineraryFields(event, schedule) {
  const itineraryUrl = schedule?.itinerary_cdn
    ? appendUrlVersion(schedule.itinerary_cdn, schedule.itinerary_source_sha256)
    : schedule?.itinerary || null;
  const paket = String(event?.paket || '').replace(PAKET_DATE_PREFIX, '').trim();
  return {
    jadwalId: event?.jadwal_id ? String(event.jadwal_id) : null,
    itineraryUrl,
    itineraryTitle: paket || schedule?.jadwal_nama || null,
  };
}

export function flightCardItineraries(entries) {
  const byUrl = new Map();
  for (const entry of entries || []) {
    const url = entry?.itineraryUrl;
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, {
      key: url,
      url,
      jadwalId: entry.jadwalId || null,
      title: entry.itineraryTitle || 'Itinerary',
      group: entry.group || '',
    });
  }
  return [...byUrl.values()];
}
