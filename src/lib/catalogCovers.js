// Pure registry + helpers for catalog cover selection (Unduh Katalog PDF).
// No React / DOM / network — unit-tested in tests/catalog-covers.test.js.
// Frontend imports via '@/lib/catalogCovers' (types from catalogCovers.d.ts).

// Deep top-gradient scrims that stay dark through the full headline (kicker →
// title → date range at ~y480 of the 600px scrim div) so the overlay reads over
// bright artwork, tinted to harmonize with each cover's palette. Raster-safe
// (flat gradients, no shadow/filter). Verified per-cover via screenshot.
const NAVY_SCRIM =
  'linear-gradient(180deg, rgba(8,16,38,0.72) 0%, rgba(8,16,38,0.58) 28%, rgba(8,16,38,0.42) 62%, rgba(8,16,38,0.30) 80%, rgba(8,16,38,0) 100%)';
const WARM_SCRIM =
  'linear-gradient(180deg, rgba(44,12,6,0.70) 0%, rgba(44,12,6,0.54) 28%, rgba(44,12,6,0.40) 62%, rgba(44,12,6,0.28) 80%, rgba(44,12,6,0) 100%)';

// Per-cover headline colors. Blue-sky covers: warm-gold kicker + white title +
// cool-white range (reads over navy scrim, harmonizes with the cool sky). Sunset:
// warmer gold + warm cream. classic omits all → component classic defaults
// (gold #E8C36B / white / cream #FBF3DF over the reddish scrim) = zero change.
const BLUE = { scrim: NAVY_SCRIM, kickerColor: '#ECD08A', titleColor: '#ffffff', rangeColor: '#EAF1FF' };
const WARM = { scrim: WARM_SCRIM, kickerColor: '#F2D79A', titleColor: '#ffffff', rangeColor: '#FFEFD6' };

/** @type {import('./catalogCovers').CatalogCover[]} */
export const CATALOG_COVERS = [
  { id: 'classic',   label: 'Classic',       image: '/img-brosur/cover-katalog.png' },
  { id: 'siang',     label: 'Siang',         image: '/img-brosur/cover-katalog-2.png', ...BLUE },
  { id: 'ihram-1',   label: 'Ihram I',       image: '/img-brosur/cover-katalog-3.png', ...BLUE },
  { id: 'ihram-2',   label: 'Ihram II',      image: '/img-brosur/cover-katalog-4.png', ...BLUE },
  { id: 'sunset',    label: 'Sunset',        image: '/img-brosur/cover-katalog-5.png', ...WARM },
  { id: 'doa',       label: 'Doa',           image: '/img-brosur/cover-katalog-6.png', ...BLUE },
  { id: 'berangkat', label: 'Keberangkatan', image: '/img-brosur/cover-katalog-7.png', ...BLUE },
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
