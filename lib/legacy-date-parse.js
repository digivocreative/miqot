/**
 * Pure date parsing for the legacy laporan HTML scrape. Kept dependency-free
 * (no cheerio/undici) so it can be unit-tested without importing the network
 * client, and reused by every laporan parser to avoid divergent month maps.
 */

// Month-token map covering English + Indonesian, abbreviations and full names.
// Keyed by the UPPERCASE first 3 letters of the token so "Des"/"Desember",
// "DEC"/"December", "Mei"/"May", "Agt"/"Agustus" all resolve. An unknown token
// returns undefined so callers fail safe to null instead of silently defaulting
// to January — the Dec("Des")->Jan corruption bug this map exists to kill.
export const MONTH_TOKEN_MAP = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', MEI: '05',
  JUN: '06', JUL: '07', AUG: '08', AGU: '08', AGT: '08', AGS: '08',
  SEP: '09', OCT: '10', OKT: '10', NOV: '11', NOP: '11', DEC: '12', DES: '12',
};

// Parse "DD MMM YYYY" / "DD Month YYYY" (English or Indonesian) to "YYYY-MM-DD".
// Returns null when the date is absent or the month token is unrecognized — a
// null caller value is preserved by the Phase-1 merge, never written as a wrong
// date.
export function parseLegacyDmyDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mm = MONTH_TOKEN_MAP[m[2].slice(0, 3).toUpperCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`;
}
