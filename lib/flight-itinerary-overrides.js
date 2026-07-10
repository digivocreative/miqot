const VERIFIED_ITINERARY_FLIGHT_TIMES = new Map([
  [
    'JBU1496|2026-07-11|SV261',
    {
      itinerarySha256: 'bbef1cdb9b95198789a9088e65ebd69049ee46ebbd68a258798d443681d844d9',
      depDateLocal: '2026-07-11',
      depLocal: '17:20',
      arrDateLocal: '2026-07-11',
      arrLocal: '21:10',
      durationMin: 230,
      source: 'verified-itinerary',
    },
  ],
]);

export function verifiedItineraryFlightTime({ eventDate, flightIata, schedule }) {
  if (!schedule?.jadwal_id || !eventDate || !flightIata) return null;
  const key = `${schedule.jadwal_id}|${eventDate}|${flightIata}`;
  const match = VERIFIED_ITINERARY_FLIGHT_TIMES.get(key);
  if (!match) return null;
  if (schedule.itinerary_source_sha256 !== match.itinerarySha256) return null;

  const { itinerarySha256: _itinerarySha256, ...publicMatch } = match;
  return { ...publicMatch };
}
