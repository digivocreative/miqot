// Hijri year definitions shared by the jamaah sync (server.js), the daily
// jamaah count audit (telegram-notifier.js) and scripts/audit-jamaah-counts.mjs.
// Add a new year HERE only — every consumer picks it up.

// Hijriah year → Gregorian date range mapping (for FETCHING from legacy system)
// tglAwal is shifted 4 months earlier to capture jamaah registered before the
// Hijriah year boundary but departing within the year. The actual hijriah_year
// assignment uses HIJRIAH_RANGES below (based on tgl_berangkat).
// Note: tglAwal for 1447 extends back to 2024-03-08 because the laporan API
// filters by registration date — jamaah who registered in 1446 but depart in 1447
// would be missed if we only start from Dec 2024.
export const HIJRIAH_YEARS = {
  '1447': { tglAwal: '2024-03-08', tglAkhir: '2026-06-15' },
  '1448': { tglAwal: '2025-12-16', tglAkhir: '2027-06-05' },
  '1449': { tglAwal: '2026-12-06', tglAkhir: '2028-05-25' },
};

// Gregorian date ranges for Hijriah years.
// Based on actual Islamic calendar: 1 Muharram of each year
export const HIJRIAH_RANGES = [
  { year: '1446', start: '2024-07-08', end: '2025-06-25' },
  { year: '1447', start: '2025-06-26', end: '2026-06-15' },
  { year: '1448', start: '2026-06-16', end: '2027-06-05' },
  { year: '1449', start: '2027-06-06', end: '2028-05-25' },
  { year: '1450', start: '2028-05-26', end: '2029-05-14' },
];

export function getHijriahDateRange(year) {
  return HIJRIAH_RANGES.find(range => range.year === String(year)) || null;
}

export function getHijriahYearFromGregorian(gregorianDate) {
  if (!gregorianDate) return null;
  const dateKey = String(gregorianDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  for (const range of HIJRIAH_RANGES) {
    if (dateKey >= range.start && dateKey <= range.end) {
      return range.year;
    }
  }
  // Dynamic fallback: approximate Hijri year from known reference point
  // Reference: 1 Muharram 1448 H ≈ 2026-06-16, one Hijri year ≈ 354.37 days
  const refDate = new Date('2026-06-16');
  const d = new Date(dateKey);
  if (Number.isNaN(d.getTime())) return null;
  const daysDiff = (d - refDate) / (1000 * 60 * 60 * 24);
  const hijriYear = 1448 + Math.floor(daysDiff / 354.37);
  return String(hijriYear);
}

export function getActiveHijriahYears() {
  return Object.keys(HIJRIAH_YEARS).sort((a, b) => Number(b) - Number(a));
}

// A Hijri year keeps being synced automatically until its departure window has
// ended more than `graceDays` ago (late corrections/refunds); after that it is
// frozen — the automatic umroh sync skips it and its DB rows stay untouched.
export const DEFAULT_JAMAAH_SYNC_GRACE_DAYS = 45;

export function getFrozenHijriahYears(now = new Date(), graceDays = DEFAULT_JAMAAH_SYNC_GRACE_DAYS) {
  const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return getActiveHijriahYears().filter((year) => {
    const range = getHijriahDateRange(year);
    return Boolean(range?.end) && range.end < cutoff;
  });
}
