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
// Takes the first segment of a multi-leg code for backward compatibility.
export function normalizeFlightCode(raw) {
  return normalizeFlightCodes(raw)[0] || '';
}

// "EK 802/358", "EK802 / EK 358" → ["EK802", "EK358"].
export function normalizeFlightCodes(raw) {
  if (raw == null) return [];
  const text = String(raw).toUpperCase();
  const out = [];
  let currentAirlineCode = '';
  const re = /([A-Z]{2})?\s*(\d{2,4})/g;
  let match;
  while ((match = re.exec(text))) {
    const airlineCode = match[1] || currentAirlineCode;
    if (!airlineCode) continue;
    currentAirlineCode = airlineCode;
    out.push(`${airlineCode}${match[2]}`.replace(SPACES, '').toUpperCase());
  }
  return [...new Set(out)];
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
    const depCodes = normalizeFlightCodes(s.berangkat_kode_penerbangan);
    const retCodes = normalizeFlightCodes(s.pulang_kode_penerbangan);
    map.set(String(s.jadwal_id), {
      berangkatTgl: (s.berangkat_tgl || '').slice(0, 10),
      depCode: depCodes[0] || '',
      depCodes,
      pulangTgl: (s.pulang_tgl || '').slice(0, 10),
      retCode: retCodes[0] || '',
      retCodes,
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
      const depCodes = sched.depCodes?.length ? sched.depCodes : [sched.depCode];
      for (const depCode of depCodes) {
        const depKey = flightKey(sched.berangkatTgl || depDate, depCode);
        if (depKey) { push(byKey, depKey, lite); placed = true; }
      }
      // Return leg.
      const retCodes = sched.retCodes?.length ? sched.retCodes : [sched.retCode];
      for (const retCode of retCodes) {
        const retKey = flightKey(sched.pulangTgl, retCode);
        if (retKey) { push(byKey, retKey, lite); placed = true; }
      }
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
