export const BANI_COMPLEX_MIN_CHARS: number;
export const BANI_COMPLEX_MIN_BULLETS: number;
export const BANI_COMPLEX_MIN_CARDS: number;

/**
 * True bila jawaban layak ditawarkan untuk dikirim ke Telegram: teks panjang,
 * berisi daftar, atau menyeret cukup banyak kartu paket/jamaah.
 */
export function isComplexBaniAnswer(
  answer: string | null | undefined,
  cards?: Array<{ type?: string } | null> | null,
): boolean;
