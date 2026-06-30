type FlightDateLike = {
  cardKey?: string | null;
  flightNumber?: string | null;
  eventDate?: string | null;
  depDate?: string | null;
  depScheduled?: string | null;
};

function validDateKey(value?: string | null): string {
  const key = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

export function flightCardDateKey(flight: FlightDateLike): string {
  return validDateKey(flight.eventDate)
    || validDateKey(flight.depDate)
    || validDateKey(flight.depScheduled);
}

export function flightCardDisplayDateValue(flight: FlightDateLike): string {
  const eventDate = validDateKey(flight.eventDate);
  if (eventDate) return `${eventDate}T00:00:00`;
  return flight.depDate || flight.depScheduled || '';
}

export function flightCardGroupKey(flight: FlightDateLike): string {
  if (flight.cardKey) return `${flight.cardKey}__${flightCardDateKey(flight)}`;
  return `${flight.flightNumber || ''}__${flightCardDateKey(flight)}`;
}
