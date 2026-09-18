export interface PromoState {
  /** Berapa kali agent menutup callout lewat tombol "Coba sekarang"/"Nanti". */
  dismissals: number;
  /** Kapan callout terakhir ditutup (epoch ms). 0 = belum pernah. */
  lastAt: number;
}

export const PROMO_INTERVAL_MS: number;
export const PROMO_MAX_DISMISSALS: number;
export function readPromoState(raw: string | null | undefined): PromoState;
export function shouldShowPromo(state: PromoState, now: number): boolean;
export function promoStateAfterDismiss(state: PromoState, now: number, counted: boolean): PromoState;
export function serializePromoState(state: PromoState): string;
