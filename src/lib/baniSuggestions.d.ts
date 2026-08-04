export type BaniSuggestionGroup = 'paket' | 'bayar' | 'jamaah' | 'agenda';

export type BaniSuggestionIcon =
  | 'plane'
  | 'clock'
  | 'wallet'
  | 'calculator'
  | 'building'
  | 'users'
  | 'cake'
  | 'calendar'
  | 'calendar-range';

export interface BaniSuggestion {
  /** Bidang pertanyaan; pengundi mengambil satu saran per grup. */
  group: BaniSuggestionGroup;
  /** Nama ikon — dipetakan ke komponen lucide di BaniPage. */
  icon: BaniSuggestionIcon;
  /** Teks yang tampil sekaligus pertanyaan yang dikirim ke Bani. */
  text: string;
}

export const BANI_SUGGESTION_GROUPS: BaniSuggestionGroup[];
export const BANI_SUGGESTION_POOL: BaniSuggestion[];
export const BANI_SUGGESTION_MEMORY: number;

export function pickBaniSuggestions(
  count?: number,
  recent?: string[] | null,
  random?: () => number,
): BaniSuggestion[];

export function rememberBaniSuggestions(
  recent: string[] | null | undefined,
  picked: Array<BaniSuggestion | string>,
  max?: number,
): string[];
