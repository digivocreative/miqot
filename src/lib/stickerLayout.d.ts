export interface StickerPlacement {
  stickerId: string;
  /** Titik tengah horizontal, pecahan lebar gambar (0..1, boleh sedikit di luar). */
  cx: number;
  /** Titik tengah vertikal, pecahan tinggi gambar. */
  cy: number;
  /** Lebar sticker sebagai pecahan lebar gambar. Tinggi = turunan dari aspect. */
  w: number;
}

export interface StickerRect {
  stickerId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STICKER_W_MIN: number;
export const STICKER_W_MAX: number;
export const STICKER_W_DEFAULT: number;
export function defaultPlacement(stickerId: string, index?: number): StickerPlacement;
export function clampPlacement(
  placement: StickerPlacement,
  aspect: number,
  imageAspect: number,
): StickerPlacement;
export function placementToRect(
  placement: StickerPlacement,
  aspect: number,
  boxW: number,
  boxH: number,
): StickerRect;
export function rectToPlacement(rect: StickerRect, boxW: number, boxH: number): StickerPlacement;
