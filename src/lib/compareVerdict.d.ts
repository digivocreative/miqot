/** Sisi perbandingan yang sudah diresolusi dari (paket, tier) oleh pemanggil. */
export interface CompareSide {
  prices: { Quard?: number; Triple?: number; Double?: number };
  hotels?: {
    mekkah?: { stars?: number; distance?: string };
    madinah?: { stars?: number; distance?: string };
  };
  seatSisa?: number;
}

export type CompareSideKey = 'a' | 'b';

/** Angka utama hero. `cheaper: null` berarti harganya sama, bukan tak diketahui. */
export interface PriceGap {
  room: 'Quard' | 'Triple' | 'Double';
  diff: number;
  cheaper: CompareSideKey | null;
}

export interface PriceVerdict { side: CompareSideKey; wins: number; total: number }
export interface HotelVerdict { side: CompareSideKey; reason: 'bintang' | 'jarak' }
export interface SeatVerdict { side: CompareSideKey; a: number; b: number }

export interface CompareVerdict {
  gap: PriceGap | null;
  price: PriceVerdict | null;
  hotel: HotelVerdict | null;
  seat: SeatVerdict | null;
}

/** `"±1,5 km"` → 1500. Format tak terbaca → `null` (tak diketahui, bukan nol). */
export function parseDistanceMeters(text: string | null | undefined): number | null;

/**
 * Selisih pada kamar termurah yang kedua sisinya berharga (Quard → Triple →
 * Double). Angka yang dipajang harus angka yang ditawarkan agent, bukan selisih
 * terbesar yang kebetulan ada.
 */
export function headlinePriceGap(
  a: CompareSide | null | undefined,
  b: CompareSide | null | undefined,
): PriceGap | null;

/** Sisi yang lebih murah di mayoritas tipe kamar yang bisa dibandingkan. */
export function priceWinner(
  a: CompareSide | null | undefined,
  b: CompareSide | null | undefined,
): PriceVerdict | null;

/** Jumlah bintang Mekkah + Madinah; seri diputus jarak, Mekkah lebih dulu. */
export function hotelWinner(
  a: CompareSide | null | undefined,
  b: CompareSide | null | undefined,
): HotelVerdict | null;

/** Sisa kursi terbanyak. Sama — termasuk sama-sama habis — berarti `null`. */
export function seatWinner(
  a: CompareSide | null | undefined,
  b: CompareSide | null | undefined,
): SeatVerdict | null;

export function buildCompareVerdict(
  a: CompareSide | null | undefined,
  b: CompareSide | null | undefined,
): CompareVerdict;
