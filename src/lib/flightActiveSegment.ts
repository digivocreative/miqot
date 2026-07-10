type FlightStatusCarrier = {
  status?: string | null;
};

export function selectActiveFlightSegment<T extends FlightStatusCarrier>(
  fallback: T,
  segments?: readonly T[] | null,
): T {
  if (!segments?.length) return fallback;

  return segments.find(segment => segment.status === 'en-route')
    || segments.find(segment => segment.status === 'delayed')
    || segments.find(segment => segment.status === 'scheduled' || segment.status === 'unverified')
    || [...segments].reverse().find(segment => segment.status === 'landed')
    || segments.find(segment => segment.status !== 'cancelled')
    || segments[0]
    || fallback;
}
