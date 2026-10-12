export interface FlightItineraryFields {
  jadwalId: string | null;
  itineraryUrl: string | null;
  itineraryTitle: string | null;
}

export interface FlightCardItinerary {
  key: string;
  url: string;
  jadwalId: string | null;
  title: string;
  group: string;
}

export function flightItineraryFields(
  event: { jadwal_id?: string | number | null; paket?: string | null } | null | undefined,
  schedule: {
    jadwal_nama?: string | null;
    itinerary?: string | null;
    itinerary_cdn?: string | null;
    itinerary_source_sha256?: string | null;
  } | null | undefined,
): FlightItineraryFields;

export function flightCardItineraries(
  entries: ReadonlyArray<{
    group?: string | null;
    jadwalId?: string | null;
    itineraryUrl?: string | null;
    itineraryTitle?: string | null;
  }>,
): FlightCardItinerary[];
