function datePart(value) {
  return String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

function compactFlight(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Validate raw provider evidence before it is enriched with calendar fields.
 * Missing identity/date/route evidence fails closed; otherwise an unrelated
 * active flight could be made to look valid by filling its blanks afterward.
 */
export function providerFlightMatchesSegment(apiData, segment) {
  if (!apiData || !segment?.flightIata || !segment?.route?.dep || !segment?.route?.arr) return false;

  const expectedDate = segment.times?.depDateLocal || segment.flightDate || null;
  const providerDate = datePart(apiData.dep_time)
    || datePart(apiData.dep_actual)
    || datePart(apiData.dep_estimated);
  if (!expectedDate || !providerDate || providerDate !== expectedDate) return false;

  if (compactFlight(apiData.flight_iata) !== compactFlight(segment.flightIata)) return false;
  if (String(apiData.dep_iata || '').toUpperCase() !== String(segment.route.dep).toUpperCase()) return false;
  if (String(apiData.arr_iata || '').toUpperCase() !== String(segment.route.arr).toUpperCase()) return false;
  return true;
}

export function flightStatusRowMatchesSegment(row, segment) {
  if (!row || !segment?.flightIata || !segment?.route?.dep || !segment?.route?.arr) return false;

  // Raw DB rows must retain the provider's own complete evidence. The row id
  // and enriched columns are local assertions and cannot prove provenance.
  if (Object.prototype.hasOwnProperty.call(row, 'raw_api')
      && !providerFlightMatchesSegment(row.raw_api, segment)) return false;

  const expectedDate = segment.times?.depDateLocal || segment.flightDate || null;
  const rowDate = datePart(row.dep_scheduled)
    || datePart(row.dep_actual)
    || datePart(row.depDate)
    || datePart(row.event_date)
    || datePart(row.eventDate)
    || datePart(row.id);
  if (!expectedDate || !rowDate || rowDate !== expectedDate) return false;

  const rowFlight = row.flight_iata || row.flightNumber;
  if (!rowFlight || compactFlight(rowFlight) !== compactFlight(segment.flightIata)) return false;
  const rowDep = row.dep_iata || row.depCode;
  const rowArr = row.arr_iata || row.arrCode;
  if (!rowDep || String(rowDep).toUpperCase() !== String(segment.route.dep).toUpperCase()) return false;
  if (!rowArr || String(rowArr).toUpperCase() !== String(segment.route.arr).toUpperCase()) return false;
  return true;
}
