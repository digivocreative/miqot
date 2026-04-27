/**
 * Pure helpers for Haji stats aggregation.
 *
 * Komisi haji = $500 USD per jamaah, paid in two stages:
 *   - $200 cair when status_bayar becomes CICILAN
 *   - $300 cair when status_bayar becomes LUNAS
 *
 * Status mapping:
 *   LUNAS / LEBIH BAYAR  → fully cair ($500)
 *   CICILAN              → $200 cair, $300 belum cair
 *   BELUM BAYAR / null   → $500 potensi
 */

export const KOMISI_RATE = 500;
export const KOMISI_STAGE1 = 200;  // cair on CICILAN
export const KOMISI_STAGE2 = 300;  // cair on LUNAS

const norm = (s) => (s || '').toString().toUpperCase().trim();

/**
 * @param {Array<{status_bayar: string|null}>} rows
 * @returns {{
 *   totalKomisi: number,
 *   sudahCair: number, sudahCairCount: number,
 *   belumCair: number, belumCairCount: number,
 *   potensi: number, potensiCount: number,
 * }}
 */
export function computeKomisi(rows) {
  let sudahCair = 0, sudahCairCount = 0;
  let belumCair = 0, belumCairCount = 0;
  let potensi = 0, potensiCount = 0;

  for (const r of rows) {
    const s = norm(r.status_bayar);
    if (s === 'LUNAS' || s === 'LEBIH BAYAR') {
      sudahCair += KOMISI_RATE;
      sudahCairCount++;
    } else if (s === 'CICILAN') {
      sudahCair += KOMISI_STAGE1;
      sudahCairCount++;
      belumCair += KOMISI_STAGE2;
      belumCairCount++;
    } else {
      potensi += KOMISI_RATE;
      potensiCount++;
    }
  }

  return {
    totalKomisi: sudahCair + belumCair + potensi,
    sudahCair, sudahCairCount,
    belumCair, belumCairCount,
    potensi, potensiCount,
  };
}

const isValidYear = (y) => typeof y === 'string' && /^\d{4}$/.test(y);

/**
 * @param {Array<{thn_masehi: string|null, status_bayar: string|null}>} rows
 * @returns {Array<{
 *   tahun: string, total: number,
 *   lunas: number, cicilan: number, belumBayar: number,
 *   komisiCair: number, komisiTotal: number
 * }>}
 */
export function computeBreakdownTahun(rows) {
  const map = new Map();
  for (const r of rows) {
    const tahun = r.thn_masehi;
    if (!isValidYear(tahun)) continue;
    if (!map.has(tahun)) {
      map.set(tahun, { tahun, total: 0, lunas: 0, cicilan: 0, belumBayar: 0, komisiCair: 0, komisiTotal: 0 });
    }
    const entry = map.get(tahun);
    entry.total++;
    entry.komisiTotal += KOMISI_RATE;

    const s = norm(r.status_bayar);
    if (s === 'LUNAS' || s === 'LEBIH BAYAR') {
      entry.lunas++;
      entry.komisiCair += KOMISI_RATE;
    } else if (s === 'CICILAN') {
      entry.cicilan++;
      entry.komisiCair += KOMISI_STAGE1;
    } else {
      entry.belumBayar++;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.tahun.localeCompare(b.tahun));
}

/**
 * @param {Array<{thn_masehi: string|null}>} rows
 * @returns {string[]} unique masehi years, sorted DESC
 */
export function computeAvailableYears(rows) {
  const set = new Set();
  for (const r of rows) {
    if (isValidYear(r.thn_masehi)) set.add(r.thn_masehi);
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Pick the default year to display: prefers the current year if present in
 * availableYears, otherwise the year closest to currentYear (ties broken by
 * preferring future years over past — agents care about upcoming komisi).
 *
 * @param {string[]} availableYears - 4-digit masehi year strings (any order)
 * @param {number|string} currentYear - current calendar year, e.g. 2026
 * @returns {string|null}
 */
export function pickDefaultYear(availableYears, currentYear) {
  if (!availableYears || availableYears.length === 0) return null;
  const cur = String(currentYear);
  if (availableYears.includes(cur)) return cur;
  const curNum = Number(cur);
  return [...availableYears].sort((a, b) => {
    const da = Math.abs(Number(a) - curNum);
    const db = Math.abs(Number(b) - curNum);
    if (da !== db) return da - db;
    return Number(b) - Number(a); // tie → later year wins
  })[0];
}
