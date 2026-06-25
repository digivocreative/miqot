export interface CatalogCover {
  id: string;
  label: string;
  /** Public path to the full-bleed cover artwork, e.g. '/img-brosur/cover-katalog-2.png'. */
  image: string;
  /** CSS background for the headline scrim; falls back to the classic reddish scrim. */
  scrim?: string;
  /** CSS background for the agent ribbon; falls back to the classic maroon. */
  ribbonGradient?: string;
  /** Override for the headline accent color; falls back to classic gold. */
  headlineColor?: string;
}

export const CATALOG_COVERS: CatalogCover[];
export const DEFAULT_COVER_ID: string;
export function getCatalogCover(id: string | null | undefined): CatalogCover;
