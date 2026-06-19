// Maps an agent's jamaah to the SPECIFIC flight they fly on, for the per-flight
// "Jamaah Saya" list on the flight-status card.
//
// The previous attribution keyed jamaah by departure DATE only, so when two
// flights left on the same day (e.g. SV 827 and EK 357 both on 20 Juni) every
// same-day flight received the agent's entire date-cohort — the identical roster
// showed up duplicated under both cards.
//
// The only precise linkage available:
//   jamaah.raw_data.id_jadwal → umroh_schedules.jadwal_id
//     → berangkat_kode_penerbangan / pulang_kode_penerbangan (the real flight code)
//   matched to calendar_events.pesawat via (date + normalized flight code).
//
// `jamaah.paket` is NOT usable: the two tables use different vocabularies
// (jamaah "HEMAT" vs calendar "PROMO UMRAH AKBAR 9HR").

const SPACES = /\s+/g;

// "SV 827", "EK 357/809", "ek 357" → "SV827" / "EK357".
// Takes the first segment of a multi-leg code (the marketing/first flight that
// the calendar records), strips spaces, uppercases.
export function normalizeFlightCode(raw) {
  if (raw == null) return '';
  const firstSeg = String(raw).split('/')[0]; // "EK 357/809" → "EK 357"
  return firstSeg.replace(SPACES, '').toUpperCase();
}

// `${YYYY-MM-DD}__${NORMALIZED_CODE}` — '' when either part is missing.
export function flightKey(dateStr, flightCode) {
  const d = (dateStr || '').slice(0, 10);
  const c = normalizeFlightCode(flightCode);
  return d && c ? `${d}__${c}` : '';
}

// schedules rows → Map<jadwal_id(string), { berangkatTgl, depCode, pulangTgl, retCode }>
export function buildScheduleFlightMap(schedules) {
  const map = new Map();
  for (const s of schedules || []) {
    if (!s || s.jadwal_id == null) continue;
    map.set(String(s.jadwal_id), {
      berangkatTgl: (s.berangkat_tgl || '').slice(0, 10),
      depCode: normalizeFlightCode(s.berangkat_kode_penerbangan),
      pulangTgl: (s.pulang_tgl || '').slice(0, 10),
      retCode: normalizeFlightCode(s.pulang_kode_penerbangan),
    });
  }
  return map;
}

const liteOf = (j) => ({ nama: j.nama, jk: j.jk || null, wa: j.wa || null });
const byName = (a, b) => (a.nama || '').localeCompare(b.nama || '');

// jamaah: [{ nama, jk, wa, tgl_berangkat, id_jadwal }]
// scheduleMap: from buildScheduleFlightMap
// → { byKey: Map<flightKey, Jamaah[]>, unresolvedByDate: Map<YYYY-MM-DD, Jamaah[]> }
//   byKey            — jamaah placed onto a precise (date+flight) key (dep AND return legs)
//   unresolvedByDate — jamaah with no usable schedule/flight code, keyed by departure date
//                      (best-effort fallback so they are never silently dropped)
export function buildJamaahFlightIndex(jamaah, scheduleMap) {
  const byKey = new Map();
  const unresolvedByDate = new Map();
  const push = (map, key, value) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };

  for (const j of jamaah || []) {
    const lite = liteOf(j);
    const depDate = (j.tgl_berangkat || '').slice(0, 10);
    const sched = j.id_jadwal != null ? scheduleMap.get(String(j.id_jadwal)) : null;

    let placed = false;
    if (sched) {
      // Departure leg — prefer the schedule's own date, fall back to the jamaah row's.
      const depKey = flightKey(sched.berangkatTgl || depDate, sched.depCode);
      if (depKey) { push(byKey, depKey, lite); placed = true; }
      // Return leg.
      const retKey = flightKey(sched.pulangTgl, sched.retCode);
      if (retKey) { push(byKey, retKey, lite); placed = true; }
    }
    if (!placed && depDate) push(unresolvedByDate, depDate, lite);
  }

  for (const list of byKey.values()) list.sort(byName);
  for (const list of unresolvedByDate.values()) list.sort(byName);
  return { byKey, unresolvedByDate };
}

// Resolve the jamaah shown on one flight card.
//   index      — from buildJamaahFlightIndex
//   eventType  — 'keberangkatan' | 'kepulangan'
//   eventDate  — the card's calendar event_date (YYYY-MM-DD)
//   flightIata — parsed flight code from the calendar pesawat ("SV827")
//   depDate    — for kepulangan, the mapped departure date (used for the fallback)
// Returns precisely-matched jamaah, merged with any unresolved jamaah on the
// relevant departure date (deduped by wa|nama, sorted by name).
export function jamaahForFlightCard(index, { eventType, eventDate, flightIata, depDate } = {}) {
  const key = flightKey(eventDate, flightIata);
  const precise = (key && index.byKey.get(key)) || [];
  const fallbackDate = eventType === 'kepulangan'
    ? (depDate || '').slice(0, 10)
    : (eventDate || '').slice(0, 10);
  const unresolved = (fallbackDate && index.unresolvedByDate.get(fallbackDate)) || [];

  if (unresolved.length === 0) return precise;

  const seen = new Set();
  const out = [];
  for (const j of [...precise, ...unresolved]) {
    const id = `${j.wa || ''}|${j.nama || ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(j);
  }
  out.sort(byName);
  return out;
}
