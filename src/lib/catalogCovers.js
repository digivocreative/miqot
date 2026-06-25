// Pure registry + helpers for catalog cover selection (Unduh Katalog PDF).
// No React / DOM / network — unit-tested in tests/catalog-covers.test.js.
// Frontend imports via '@/lib/catalogCovers' (types from catalogCovers.d.ts).

// Full-canvas scrims (component scrim div is inset:0) shaping the dark region that
// backs the headline, tinted to harmonize with each cover's palette. Raster-safe
// (flat gradients, no shadow/filter). Verified per-cover via screenshot.
// *_TOP: top band for a centered headline. *_LEFT: upper-left wedge for a
// left-aligned headline (so it sits in the cover's negative space, off the subject).
const NAVY_TOP =
  'linear-gradient(180deg, rgba(8,16,38,0.74) 0%, rgba(8,16,38,0.52) 18%, rgba(8,16,38,0.34) 28%, rgba(8,16,38,0) 40%)';
const WARM_TOP =
  'linear-gradient(180deg, rgba(46,14,6,0.72) 0%, rgba(46,14,6,0.52) 18%, rgba(46,14,6,0.34) 28%, rgba(46,14,6,0) 40%)';
const NAVY_LEFT =
  'radial-gradient(78% 62% at 26% 30%, rgba(8,16,38,0.80) 0%, rgba(8,16,38,0.44) 46%, rgba(8,16,38,0) 72%), linear-gradient(180deg, rgba(8,16,38,0.40) 0%, rgba(8,16,38,0) 26%)';

// Headline placement for subject-on-one-side covers: a left block in the open area.
const BOX_LEFT = { top: 150, left: 80, width: 560, align: 'left' };

// Reusable per-cover bundles (scrim + headline colors [+ composition]). Blue-sky
// covers: warm-gold kicker + white title + cool-white range. Sunset/dawn: warmer
// gold + warm cream. classic omits everything → component defaults (gold/white/
// cream over the reddish scrim, centered) = zero change.
const BLUE_TOP  = { scrim: NAVY_TOP,  kickerColor: '#ECD08A', titleColor: '#ffffff', rangeColor: '#EAF1FF' };
const WARM_TOP_C = { scrim: WARM_TOP, kickerColor: '#F2D79A', titleColor: '#ffffff', rangeColor: '#FFEFD6' };
const BLUE_LEFT = { ...BLUE_TOP, scrim: NAVY_LEFT, headline: BOX_LEFT };

/** @type {import('./catalogCovers').CatalogCover[]} */
export const CATALOG_COVERS = [
  { id: 'classic',   label: 'Classic',       image: '/img-brosur/cover-katalog.png' },
  { id: 'siang',     label: 'Siang',         image: '/img-brosur/cover-katalog-2.png', ...BLUE_TOP },
  { id: 'ihram-1',   label: 'Ihram I',       image: '/img-brosur/cover-katalog-3.png', ...BLUE_LEFT },
  { id: 'ihram-2',   label: 'Ihram II',      image: '/img-brosur/cover-katalog-4.png', ...BLUE_LEFT },
  { id: 'sunset',    label: 'Sunset',        image: '/img-brosur/cover-katalog-5.png', ...WARM_TOP_C },
  { id: 'doa',       label: 'Doa',           image: '/img-brosur/cover-katalog-6.png', ...BLUE_TOP },
  { id: 'berangkat', label: 'Keberangkatan', image: '/img-brosur/cover-katalog-7.png', ...BLUE_TOP },
  { id: 'menara',    label: 'Menara',        image: '/img-brosur/cover-katalog-8.png', ...BLUE_LEFT },
  { id: 'fajar',     label: 'Fajar',         image: '/img-brosur/cover-katalog-9.png', ...WARM_TOP_C },
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
