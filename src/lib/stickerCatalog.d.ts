export type StickerGroupId = 'ketersediaan' | 'populer' | 'fasilitas' | 'plus' | 'promo';

export interface StickerDef {
  id: string;
  label: string;
  group: StickerGroupId;
  /** Lebar/tinggi gambar sticker. Ditulis di katalog, bukan dibaca saat runtime. */
  aspect: number;
}

export interface StickerGroupDef {
  id: StickerGroupId;
  label: string;
}

export const STICKER_BASE: string;
export const STICKER_THUMB_BASE: string;
export const STICKER_GROUPS: ReadonlyArray<StickerGroupDef>;
export const STICKERS: ReadonlyArray<StickerDef>;
export const STICKER_PROMO_PREVIEW: ReadonlyArray<string>;
export function stickerById(id: string): StickerDef | null;
export function stickerFullUrl(id: string): string;
export function stickerThumbUrl(id: string): string;
