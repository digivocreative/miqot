// Pure registry + helpers for catalog cover selection (Unduh Katalog PDF).
// No React / DOM / network — unit-tested in tests/catalog-covers.test.js.
// Frontend imports via '@/lib/catalogCovers' (types from catalogCovers.d.ts).

// Neutral dark top-gradient scrim: keeps the gold/white headline legible over the
// bright skies of cover 2–7. Raster-safe (flat gradient, no shadow/filter).
const BRIGHT_SCRIM =
  'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 32%, rgba(0,0,0,0) 58%)';

/** @type {import('./catalogCovers').CatalogCover[]} */
export const CATALOG_COVERS = [
  { id: 'classic',   label: 'Classic',       image: '/img-brosur/cover-katalog.png' },
  { id: 'siang',     label: 'Siang',         image: '/img-brosur/cover-katalog-2.png', scrim: BRIGHT_SCRIM },
  { id: 'ihram-1',   label: 'Ihram I',       image: '/img-brosur/cover-katalog-3.png', scrim: BRIGHT_SCRIM },
  { id: 'ihram-2',   label: 'Ihram II',      image: '/img-brosur/cover-katalog-4.png', scrim: BRIGHT_SCRIM },
  { id: 'sunset',    label: 'Sunset',        image: '/img-brosur/cover-katalog-5.png', scrim: BRIGHT_SCRIM },
  { id: 'doa',       label: 'Doa',           image: '/img-brosur/cover-katalog-6.png', scrim: BRIGHT_SCRIM },
  { id: 'berangkat', label: 'Keberangkatan', image: '/img-brosur/cover-katalog-7.png', scrim: BRIGHT_SCRIM },
];

export const DEFAULT_COVER_ID = 'classic';

/**
 * Resolve a stored/selected cover id to a CatalogCover, falling back to the
 * default cover for unknown / null / undefined ids.
 * @param {string | null | undefined} id
 * @returns {import('./catalogCovers').CatalogCover}
 */
export function getCatalogCover(id) {
  return (
    CATALOG_COVERS.find((c) => c.id === id) ||
    CATALOG_COVERS.find((c) => c.id === DEFAULT_COVER_ID) ||
    CATALOG_COVERS[0]
  );
}
