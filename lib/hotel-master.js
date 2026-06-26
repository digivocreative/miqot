// Hotel master canonicalization + package-usage aggregation.
//
// The Alhijaz API hands us messy hotel strings inside umroh_schedules.paket_hotel,
// keyed by tier (HEMAT/UHUD/RAHMAH) and city (mekkah/madinah), e.g.
//   "PULLMAN ZAMZAM/SETARAF (⭐5)", "ODST  ALMADINAH", "AL RITZ AL MADINAH /SETARAF".
// hotel_master rows hold curated facts plus a list of normalized aliases so we can
// resolve each raw string back to a single canonical hotel entity, then answer
// "which active packages stay at this hotel".
//
// Pure functions only — no DB access — so they're trivially testable.

/**
 * Normalize a raw paket_hotel string to a canonical comparison key:
 * uppercase, drop star markers and the "/SETARAF" alternative suffix, strip
 * punctuation, collapse whitespace. The same function is used to normalize the
 * stored aliases so matching is apples-to-apples.
 */
export function normalizeHotelName(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\(?\s*[★⭐]\s*\d+\s*\)?/g, ' ') // (★5) / ⭐4 star markers
    .replace(/\/\s*SETARAF.*$/i, ' ')         // "/SETARAF ..." alternative suffix
    .replace(/\bSETARAF\b/g, ' ')             // stray SETARAF token
    .replace(/[^A-Z0-9 ]/g, ' ')              // punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect a "setaraf"-only string with no named hotel — the API is only promising
 * a star class, not a specific property. These must NOT be presented as a named
 * hotel (it would be a false promise to the jamaah).
 */
export function isSetarafOnly(rawString) {
  return normalizeHotelName(rawString).length === 0 && /SETARAF/i.test(String(rawString || ''));
}

/**
 * Build a city-scoped matcher from hotel_master rows.
 * Returns { mekkah: [...], madinah: [...] }, each entry { slug, norms: string[] }.
 */
export function buildHotelMatcher(hotels) {
  const byCity = { mekkah: [], madinah: [] };
  for (const h of hotels || []) {
    const city = String(h.city || '').toLowerCase();
    if (!byCity[city]) byCity[city] = [];
    const aliases = Array.isArray(h.aliases) ? h.aliases : [];
    const norms = aliases.map(normalizeHotelName).filter(Boolean);
    // Always include the hotel's own name as a fallback alias.
    const nameNorm = normalizeHotelName(h.name);
    if (nameNorm && !norms.includes(nameNorm)) norms.push(nameNorm);
    byCity[city].push({ slug: h.slug, norms });
  }
  return byCity;
}

/**
 * Resolve a raw hotel string within a city to a hotel_master slug, or null.
 * Exact normalized-alias match first; substring match as a fallback. City-scoped
 * so e.g. Mekkah "MOVENPICK" never collides with Madinah "ANWAR ... MOVENPICK".
 */
export function matchHotelSlug(rawString, city, matcher) {
  const norm = normalizeHotelName(rawString);
  if (!norm) return null;
  const candidates = (matcher && matcher[String(city || '').toLowerCase()]) || [];
  for (const c of candidates) {
    if (c.norms.includes(norm)) return c.slug;
  }
  // Fallback: longest alias that is a substring (either direction) of the input.
  let best = null;
  let bestLen = 0;
  for (const c of candidates) {
    for (const a of c.norms) {
      if ((norm.includes(a) || a.includes(norm)) && a.length > bestLen) {
        best = c.slug;
        bestLen = a.length;
      }
    }
  }
  return best;
}

const CITY_KEYS = ['mekkah', 'madinah'];

function toNumber(v) {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lowest meaningful nightly/package price across the given tiers. Reads
 * paket_harga[tier] = { Quard, Triple, Double, Single, Infant } and returns the
 * smallest non-infant room price found, or null.
 */
export function lowestPriceForTiers(paketHarga, tierNames) {
  if (!paketHarga || typeof paketHarga !== 'object') return null;
  let lowest = null;
  for (const tier of tierNames) {
    const room = paketHarga[tier];
    if (!room || typeof room !== 'object') continue;
    for (const [type, val] of Object.entries(room)) {
      if (/infant/i.test(type)) continue;
      const n = toNumber(val);
      if (n != null && (lowest == null || n < lowest)) lowest = n;
    }
  }
  return lowest;
}

/**
 * Aggregate which schedules use each hotel.
 * @param {Array} schedules rows with { jadwal_id, jadwal_nama, year_code,
 *   berangkat_tgl, pulang_tgl, seat_sisa, maskapai, paket_hotel, paket_harga }
 * @param {Array} hotels hotel_master rows
 * @returns {Map<string, Array>} slug -> array of package usage entries, each:
 *   { jadwal_id, year_code, jadwal_nama, berangkat_tgl, pulang_tgl, seat_sisa,
 *     maskapai, city, tiers: string[], lowest_price }
 */
export function aggregatePackageUsage(schedules, hotels) {
  const matcher = buildHotelMatcher(hotels);
  const out = new Map();

  for (const s of schedules || []) {
    const paketHotel = s.paket_hotel && typeof s.paket_hotel === 'object' ? s.paket_hotel : {};
    // slug -> { city, tiers:Set }
    const perHotel = new Map();

    for (const [tierName, tierInfo] of Object.entries(paketHotel)) {
      if (!tierInfo || typeof tierInfo !== 'object') continue;
      for (const city of CITY_KEYS) {
        const raw = tierInfo[city];
        if (!raw) continue;
        const slug = matchHotelSlug(raw, city, matcher);
        if (!slug) continue;
        if (!perHotel.has(slug)) perHotel.set(slug, { city, tiers: new Set() });
        perHotel.get(slug).tiers.add(tierName);
      }
    }

    for (const [slug, info] of perHotel) {
      const tiers = Array.from(info.tiers);
      const entry = {
        jadwal_id: s.jadwal_id,
        year_code: s.year_code,
        jadwal_nama: s.jadwal_nama,
        berangkat_tgl: s.berangkat_tgl,
        pulang_tgl: s.pulang_tgl,
        seat_sisa: toNumber(s.seat_sisa) || 0,
        maskapai: s.maskapai || '',
        city: info.city,
        tiers,
        lowest_price: lowestPriceForTiers(s.paket_harga, tiers),
      };
      if (!out.has(slug)) out.set(slug, []);
      out.get(slug).push(entry);
    }
  }

  // Sort each hotel's packages by soonest departure.
  for (const list of out.values()) {
    list.sort((a, b) => String(a.berangkat_tgl || '').localeCompare(String(b.berangkat_tgl || '')));
  }
  return out;
}
