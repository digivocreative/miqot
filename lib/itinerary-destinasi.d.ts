/** Foto destinasi di Bunny CDN, dipasangkan dari teks aktivitas itinerary. */
export interface DestinationPhoto {
  /** Nama berkas master PNG di CDN. */
  file: string;
  /** Nama tempat untuk ditampilkan, mis. "Masjidil Haram". */
  label: string;
}

/** Satu aktivitas bisa berupa teks polos atau objek berjam. */
export interface ItineraryActivityLike {
  text?: string;
  time?: string;
}

export interface ItineraryDayLike {
  activities?: Array<string | ItineraryActivityLike> | null;
}

export const DESTINASI_PHOTO_BASE: string;

/** URL derivatif webp 800px — bukan master PNG yang berukuran besar. */
export function destinationPhotoUrl(file: string): string;

export function destinationPhotoForText(text: string | null | undefined): DestinationPhoto | null;

/**
 * Foto per aktivitas untuk seluruh itinerary, sejajar dengan `day.activities`.
 * Dedup global: tiap foto hanya muncul di kemunculan pertamanya. Dua entri
 * bandara (`keberangkatan-di-bandara`, `kepulangan-di-bandara`) menempel pada
 * MOMEN, bukan nama tempat — saring bila yang dicari daftar destinasi.
 */
export function destinationPhotosForDays(
  days: readonly ItineraryDayLike[] | null | undefined,
): Array<Array<DestinationPhoto | null>>;
