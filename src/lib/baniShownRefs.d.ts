export const BANI_SHOWN_CARDS_MAX: number;

/** Rujukan satu kartu/hitungan yang tampil — id & nama saja, tanpa isinya. */
export interface BaniShownRef {
  type: 'package' | 'jamaah' | 'kalkulasi';
  id: string;
  nama: string | null;
  tier?: string;
  input?: Record<string, number>;
  total?: number;
}

/**
 * Rujukan kartu, media, dan hitungan yang tampil di satu giliran — bahan
 * jangkar "[Kartu di layar: ...]" yang dirakit server dari riwayat.
 *
 * Brosur & itinerary ikut sebagai rujukan paket; brosur_jadwal tidak (yang
 * dirujuknya bulan). Rujukan tanpa id dibuang, yang kembar disatukan.
 */
export function buildShownRefs(turn: {
  cards?: readonly unknown[] | null;
  media?: readonly unknown[] | null;
  kalkulasi?: readonly unknown[] | null;
}): BaniShownRef[];
