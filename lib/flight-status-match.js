function datePart(value) {
  return String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

function compactFlight(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function shiftIsoDate(dateString, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) return null;
  const value = new Date(`${dateString}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function clockMinutes(hhmm) {
  const match = String(hhmm || '').match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * A derived departure clock this close to midnight may sit on the other side
 * of it. The calendar derives a leg's departure from the trip-level Indonesian
 * time minus a table duration, so a flight timetabled at 23:55 comes out as
 * 00:25 the next day (SV820 MED–CGK, 2026-09-05): same aircraft, provider
 * evidence dated the day before, and an exact date check threw away a fresh
 * en-route response every hour. Three hours absorbs duration-table error and
 * calendar rounding while a daily flight's other instances stay 24h away.
 */
const MIDNIGHT_BAND_MINUTES = 3 * 60;

/**
 * Local departure dates the provider's own evidence may carry for this
 * segment. `dateToleranceDays` widens the set for callers whose date is a
 * local key rather than a derived clock (a share is looked up by that exact
 * key, so widening cannot reach another instance of the flight number).
 */
export function expectedDepartureDates(segment, { dateToleranceDays = 0 } = {}) {
  const date = segment?.times?.depDateLocal || segment?.flightDate || null;
  if (!date) return [];
  const dates = new Set([date]);
  const minutes = clockMinutes(segment?.times?.depLocal);
  if (minutes !== null && minutes < MIDNIGHT_BAND_MINUTES) dates.add(shiftIsoDate(date, -1));
  if (minutes !== null && minutes >= 24 * 60 - MIDNIGHT_BAND_MINUTES) dates.add(shiftIsoDate(date, 1));
  for (let days = 1; days <= dateToleranceDays; days++) {
    dates.add(shiftIsoDate(date, -days));
    dates.add(shiftIsoDate(date, days));
  }
  dates.delete(null);
  return [...dates];
}

/**
 * Validate raw provider evidence before it is enriched with calendar fields.
 * Missing identity/date/route evidence fails closed; otherwise an unrelated
 * active flight could be made to look valid by filling its blanks afterward.
 */
export function providerFlightMatchesSegment(apiData, segment, options = {}) {
  if (!apiData || !segment?.flightIata || !segment?.route?.dep || !segment?.route?.arr) return false;

  const expectedDates = expectedDepartureDates(segment, options);
  const providerDate = datePart(apiData.dep_time)
    || datePart(apiData.dep_actual)
    || datePart(apiData.dep_estimated);
  if (expectedDates.length === 0 || !providerDate || !expectedDates.includes(providerDate)) return false;

  if (compactFlight(apiData.flight_iata) !== compactFlight(segment.flightIata)) return false;
  if (String(apiData.dep_iata || '').toUpperCase() !== String(segment.route.dep).toUpperCase()) return false;
  if (String(apiData.arr_iata || '').toUpperCase() !== String(segment.route.arr).toUpperCase()) return false;
  return true;
}

export function flightStatusRowMatchesSegment(row, segment, options = {}) {
  if (!row || !segment?.flightIata || !segment?.route?.dep || !segment?.route?.arr) return false;

  // Raw DB rows must retain the provider's own complete evidence. The row id
  // and enriched columns are local assertions and cannot prove provenance.
  if (Object.prototype.hasOwnProperty.call(row, 'raw_api')
      && !providerFlightMatchesSegment(row.raw_api, segment, options)) return false;

  const expectedDates = expectedDepartureDates(segment, options);
  const rowDate = datePart(row.dep_scheduled)
    || datePart(row.dep_actual)
    || datePart(row.depDate)
    || datePart(row.event_date)
    || datePart(row.eventDate)
    || datePart(row.id);
  if (expectedDates.length === 0 || !rowDate || !expectedDates.includes(rowDate)) return false;

  const rowFlight = row.flight_iata || row.flightNumber;
  if (!rowFlight || compactFlight(rowFlight) !== compactFlight(segment.flightIata)) return false;
  const rowDep = row.dep_iata || row.depCode;
  const rowArr = row.arr_iata || row.arrCode;
  if (!rowDep || String(rowDep).toUpperCase() !== String(segment.route.dep).toUpperCase()) return false;
  if (!rowArr || String(rowArr).toUpperCase() !== String(segment.route.arr).toUpperCase()) return false;
  return true;
}
