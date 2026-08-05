/** Satu aktivitas bisa berupa teks polos atau objek berjam. */
export interface ItineraryActivityLike {
  text?: string;
  time?: string;
}

export interface ItineraryDayLike {
  activities?: Array<string | ItineraryActivityLike> | null;
}

export interface PlaceFilterOptions {
  /** Hanya tempat bertanda `sorotan` — yang dipakai PDF perbandingan paket. */
  sorotanSaja?: boolean;
}

/**
 * Semua tempat yang disebut satu potong teks, urut kemunculannya. Berbeda dari
 * `destinationPhotoForText` yang berhenti di kecocokan pertama.
 */
export function placesInText(
  text: string | null | undefined,
  options?: PlaceFilterOptions,
): string[];

/**
 * Tempat yang dikunjungi sepanjang itinerary, urut kemunculan dan tanpa
 * duplikat. Kota, moda transportasi, dan toko oleh-oleh tidak ikut.
 */
export function visitedPlacesForDays(
  days: readonly ItineraryDayLike[] | null | undefined,
  options?: PlaceFilterOptions,
): string[];

/** Sorotan saja — subset berurutan dari `visitedPlacesForDays`. */
export function highlightPlacesForDays(
  days: readonly ItineraryDayLike[] | null | undefined,
): string[];
