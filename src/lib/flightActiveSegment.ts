type FlightStatusCarrier = {
  status?: string | null;
};

export function selectActiveFlightSegment<T extends FlightStatusCarrier>(
  fallback: T,
  segments?: readonly T[] | null,
): T {
  if (!segments?.length) return fallback;

  // Before a journey starts (no leg has landed), surface the leg carrying the
  // trusted trip clock — under anchor-trust that is the only 'scheduled' leg.
  // Once any leg has landed, fall through so an in-progress (unverified) leg is
  // not skipped for a later scheduled leg.
  const journeyStarted = segments.some(segment => segment.status === 'landed');
  return segments.find(segment => segment.status === 'en-route')
    || segments.find(segment => segment.status === 'delayed')
    || (journeyStarted ? undefined : segments.find(segment => segment.status === 'scheduled'))
    || segments.find(segment => segment.status === 'scheduled' || segment.status === 'unverified')
    || [...segments].reverse().find(segment => segment.status === 'landed')
    || segments.find(segment => segment.status !== 'cancelled')
    || segments[0]
    || fallback;
}
