export const BANI_TELEGRAM_MAX_LEN: number;
export const BANI_TELEGRAM_MAX_CARDS: number;

export interface BaniTelegramInput {
  question?: string | null;
  answer?: string | null;
  cards?: Array<Record<string, unknown>> | null;
}

/** Pesan siap kirim dengan parse_mode HTML (sudah ter-escape & terpotong aman). */
export function formatBaniTelegramMessage(input?: BaniTelegramInput): string;
