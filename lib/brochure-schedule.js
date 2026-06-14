const ROOM_PRIORITY = ['Quard', 'Triple', 'Double']; // Infant intentionally excluded

function tierPrice(tier) {
  if (!tier || typeof tier !== 'object') return null;
  for (const room of ROOM_PRIORITY) {
    const v = Number(tier[room]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function parseHotelString(value) {
  if (!value || typeof value !== 'string') return { name: '', stars: null };
  const starMatch = value.match(/[★⭐]\s*(\d+)/);
  const stars = starMatch ? Number(starMatch[1]) : null;
  const name = value
    .replace(/\([★⭐]\s*\d+\)\s*$/g, '')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { name, stars: Number.isFinite(stars) ? stars : null };
}

function tierKeyForHotel(paket_hotel, tierName) {
  if (!paket_hotel || typeof paket_hotel !== 'object' || !tierName) return null;
  if (paket_hotel[tierName]) return tierName;
  const normalized = String(tierName).toLowerCase().replace(/\s+/g, '');
  return Object.keys(paket_hotel).find(k => String(k).toLowerCase().replace(/\s+/g, '') === normalized) || null;
}

function cityHotel(info, city) {
  if (!info || typeof info !== 'object') return null;

  if (typeof info[city] === 'string') {
    const parsed = parseHotelString(info[city]);
    return parsed.name ? { city: city === 'mekkah' ? 'Mekkah' : 'Madinah', name: parsed.name, stars: parsed.stars } : null;
  }

  const name = String(info[`${city}_hotel`] || '').trim();
  if (!name) return null;
  const rawStars = Number(info[`${city}_bintang`]);
  return {
    city: city === 'mekkah' ? 'Mekkah' : 'Madinah',
    name: name.replace(/\s*\/\s*/g, ' / ').replace(/\s{2,}/g, ' ').trim(),
    stars: Number.isFinite(rawStars) && rawStars > 0 ? rawStars : null,
  };
}

export function pickBrochureHotels(paket_hotel, tierName) {
  const key = tierKeyForHotel(paket_hotel, tierName);
  const info = key ? paket_hotel[key] : null;
  return [cityHotel(info, 'mekkah'), cityHotel(info, 'madinah')].filter(Boolean);
}

export function pickBrochurePackageDetails(paket_harga, paket_hotel) {
  if (!paket_harga || typeof paket_harga !== 'object') return null;

  let best = null;
  for (const [tierName, tier] of Object.entries(paket_harga)) {
    const harga = tierPrice(tier);
    if (harga === null) continue;
    if (!best || harga < best.harga) {
      best = {
        harga,
        tier: tierName,
        hotel: pickBrochureHotels(paket_hotel, tierName),
      };
    }
  }
  return best;
}

export function pickBrochurePrice(paket_harga) {
  return pickBrochurePackageDetails(paket_harga, null)?.harga ?? null;
}

export function cleanBrochurePackageName(name) {
  return String(name || '')
    .replace(/\bMIX\s+(?:PAKET\s+)?(?:RAHMAH\s*&\s*UHUD|UHUD\s*&\s*RAHMAH|RAHMAH\s+UHUD|UHUD\s+RAHMAH)\b/gi, '')
    .replace(/\b\d+\s*HR\b/gi, '')
    .replace(/\s+\(/g, ' (')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .replace(/\+\s*$/g, '')
    .trim()
    .toUpperCase();
}

export function countBrochureTripDays(berangkat_tgl, pulang_tgl) {
  const start = parseISODate(berangkat_tgl);
  const end = parseISODate(pulang_tgl);
  if (!start || !end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : null;
}

// Names like "PLUS TURKEY 15HR (KERETA CEPAT)" embed the agent-authoritative
// duration. For packages with extensions (Turki, Cairo, Dubai), the stored
// berangkat_tgl/pulang_tgl often cover only the umroh leg, so date-arithmetic
// undercounts. Prefer this when available.
export function extractDurationFromName(rawName) {
  const m = String(rawName || '').match(/\b(\d+)\s*HR\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

function parseRouteLegs(rute) {
  if (!rute) return [];
  return String(rute).split('/').map(s => {
    const parts = s.split('-').map(p => p.trim().toUpperCase());
    return parts.length === 2 && parts[0] && parts[1] ? { from: parts[0], to: parts[1] } : null;
  }).filter(Boolean);
}

export function isUmrohFirstRoute(berangkatRute) {
  const depart = parseRouteLegs(berangkatRute);
  if (!depart.length) return false;
  // Match the Ask AI itinerary inference: the last arrival on the departure
  // chain is where the ibadah route begins. JED means Mekkah/Umroh first.
  return depart[depart.length - 1].to === 'JED';
}

const LANDING_CITY_BY_CODE = {
  JED: 'Jeddah',
  MED: 'Madinah',
};

// Landing = final arrival airport on the departure chain (same leg isUmrohFirstRoute
// reads). Returns a display city name; falls back to Jeddah when the route is
// missing/unknown, mirroring the public listing's getLandingAirportCode behaviour.
export function landingCityFromRoute(berangkatRute) {
  const legs = parseRouteLegs(berangkatRute);
  const code = legs.length ? legs[legs.length - 1].to : 'JED';
  return LANDING_CITY_BY_CODE[code] || code;
}

export function parseSeatSisa(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const MONTH_LABEL_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function parseISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoMonth(date) {
  // UTC-based formatting so we don't shift across timezones
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMonthsUTC(date, months) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const d = date.getUTCDate();
  // Last day of target month: day 0 of next month rolls back to last day of target month
  const lastDayOfTargetMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDayOfTargetMonth);
  return new Date(Date.UTC(y, m, clampedDay));
}

export function groupPackagesByMonth(packages, today, monthsAhead) {
  if (!Array.isArray(packages) || packages.length === 0) return [];

  const startMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const endMs = addMonthsUTC(new Date(startMs), monthsAhead).getTime();

  const groups = new Map(); // key → { key, label, monthIndexId, year, packages: [] }
  for (const pkg of packages) {
    const d = parseISODate(pkg.berangkat_tgl);
    if (!d) continue;
    const ms = d.getTime();
    if (ms < startMs || ms >= endMs) continue;

    const key = isoMonth(d);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: `${MONTH_LABEL_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        monthIndexId: d.getUTCMonth(),
        year: d.getUTCFullYear(),
        packages: [],
        truncatedCount: 0,
      });
    }
    groups.get(key).packages.push(pkg);
  }

  const result = [...groups.values()];
  result.sort((a, b) => a.key.localeCompare(b.key));
  for (const g of result) {
    g.packages.sort((a, b) => String(a.berangkat_tgl).localeCompare(String(b.berangkat_tgl)));
  }
  return result;
}
