export interface CatalogCover {
  id: string;
  label: string;
  /** Public path to the full-bleed cover artwork, e.g. '/img-brosur/cover-katalog-2.png'. */
  image: string;
  /** CSS background for the headline scrim; falls back to the classic reddish scrim. */
  scrim?: string;
  /** CSS background for the agent ribbon; falls back to the classic maroon. */
  ribbonGradient?: string;
  /** "KATALOG UMROH" kicker + divider color; falls back to classic gold (#E8C36B). */
  kickerColor?: string;
  /** "Paket Umroh" title color; falls back to classic white (#fff). */
  titleColor?: string;
  /** Date-range label color; falls back to classic cream (#FBF3DF). */
  rangeColor?: string;
  /** Headline composition (placement + alignment); falls back to centered top. */
  headline?: {
    /** Top offset in px (canvas is 1080×1620). Default 150. */
    top?: number;
    /** Left offset in px. Default 90. */
    left?: number;
    /** Right offset in px (ignored when `width` is set). Default 90. */
    right?: number;
    /** Fixed block width in px; use for left/right blocks instead of `right`. */
    width?: number;
    /** Text + block alignment. Default 'center'. */
    align?: 'left' | 'center' | 'right';
  };
}

export const CATALOG_COVERS: CatalogCover[];
export const DEFAULT_COVER_ID: string;
export function getCatalogCover(id: string | null | undefined): CatalogCover;
