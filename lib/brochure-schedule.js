const ROOM_PRIORITY = ['Quard', 'Triple', 'Double']; // Infant intentionally excluded

function tierPrice(tier) {
  if (!tier || typeof tier !== 'object') return null;
  for (const room of ROOM_PRIORITY) {
    const v = Number(tier[room]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

export function pickBrochurePrice(paket_harga) {
  if (!paket_harga || typeof paket_harga !== 'object') return null;
  let min = null;
  for (const tier of Object.values(paket_harga)) {
    const p = tierPrice(tier);
    if (p === null) continue;
    if (min === null || p < min) min = p;
  }
  return min;
}

const MONTH_LABEL_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const MAX_PACKAGES_PER_MONTH = 10;

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
    if (g.packages.length > MAX_PACKAGES_PER_MONTH) {
      g.truncatedCount = g.packages.length - MAX_PACKAGES_PER_MONTH;
      g.packages = g.packages.slice(0, MAX_PACKAGES_PER_MONTH);
    }
  }
  return result;
}
