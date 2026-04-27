/**
 * Pure helpers for Haji stats aggregation.
 *
 * Komisi haji varies by paket, paid in two stages:
 *   - Stage 1 ($200) cair when status_bayar is anything other than BELUM BAYAR
 *     (i.e. CICILAN, LUNAS, or LEBIH BAYAR — agent has received first payment)
 *   - Stage 2 (rest: $300 UHUD / $550 RAHMAH) cair ONLY when status_berangkat
 *     is SUDAH BERANGKAT. Even if status_bayar=LUNAS, stage 2 stays belumCair
 *     until the jamaah actually departs.
 *
 * Paket rates:
 *   UHUD   → $500 total ($200 stage1 + $300 stage2)
 *   RAHMAH → $750 total ($200 stage1 + $550 stage2)
 *
 * Status mapping:
 *   BELUM BAYAR / null     → entire rate is potensi
 *   CICILAN/LUNAS/LEBIH BAYAR, not departed → stage1 cair, stage2 belumCair
 *   CICILAN/LUNAS/LEBIH BAYAR + SUDAH BERANGKAT → full rate cair
 */

export const KOMISI_STAGE1 = 200;          // cair on CICILAN — same for all paket
export const KOMISI_RATE_UHUD = 500;       // total komisi for UHUD paket
export const KOMISI_RATE_RAHMAH = 750;     // total komisi for RAHMAH paket

/**
 * Resolve per-jamaah komisi rate from paket_detail (set by Surat Pernyataan
 * scraper — see haji-api.js). The jamaah_haji.paket field only contains
 * "Arbain"/"Non Arbain"; UHUD vs RAHMAH lives in paket_detail.
 *
 * Default is UHUD ($500) when paket_detail is null/unknown — conservative
 * estimate that matches the lower of the two known rates.
 */
export function getHajiRate(paketDetail) {
  const p = (paketDetail || '').toString().toLowerCase();
  if (p.includes('rahmah')) return KOMISI_RATE_RAHMAH;
  return KOMISI_RATE_UHUD;
}

const norm = (s) => (s || '').toString().toUpperCase().trim();

/**
 * @param {Array<{status_bayar: string|null, status_berangkat: string|null}>} rows
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
    const b = norm(r.status_berangkat);
    const rate = getHajiRate(r.paket_detail);
    const stage2 = rate - KOMISI_STAGE1;
    const hasPaid = s === 'CICILAN' || s === 'LUNAS' || s === 'LEBIH BAYAR';
    const hasDeparted = b === 'SUDAH BERANGKAT';

    if (!hasPaid) {
      potensi += rate;
      potensiCount++;
      continue;
    }

    // Stage 1 always cair when paid
    sudahCair += KOMISI_STAGE1;
    sudahCairCount++;

    // Stage 2 cair only after departure
    if (hasDeparted) {
      sudahCair += stage2;
    } else {
      belumCair += stage2;
      belumCairCount++;
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
 * @param {Array<{thn_masehi: string|null, status_bayar: string|null, status_berangkat: string|null}>} rows
 * @returns {Array<{
 *   tahun: string, total: number,
 *   lunas: number, cicilan: number, belumBayar: number, sudahBerangkat: number,
 *   komisiCair: number, komisiTotal: number
 * }>}
 */
export function computeBreakdownTahun(rows) {
  const map = new Map();
  for (const r of rows) {
    const tahun = r.thn_masehi;
    if (!isValidYear(tahun)) continue;
    if (!map.has(tahun)) {
      map.set(tahun, { tahun, total: 0, lunas: 0, cicilan: 0, belumBayar: 0, sudahBerangkat: 0, komisiCair: 0, komisiTotal: 0 });
    }
    const entry = map.get(tahun);
    const rate = getHajiRate(r.paket_detail);
    const stage2 = rate - KOMISI_STAGE1;
    entry.total++;
    entry.komisiTotal += rate;

    const s = norm(r.status_bayar);
    const b = norm(r.status_berangkat);
    if (s === 'LUNAS' || s === 'LEBIH BAYAR') entry.lunas++;
    else if (s === 'CICILAN') entry.cicilan++;
    else entry.belumBayar++;
    if (b === 'SUDAH BERANGKAT') entry.sudahBerangkat++;

    const hasPaid = s === 'CICILAN' || s === 'LUNAS' || s === 'LEBIH BAYAR';
    if (hasPaid) {
      entry.komisiCair += KOMISI_STAGE1;
      if (b === 'SUDAH BERANGKAT') entry.komisiCair += stage2;
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

/**
 * Count rows by paket category from paket_detail. Rows where paket_detail
 * is null/empty go to `unknown` so the UI can surface how many jamaah
 * still need backfill. STANDAR is bucketed separately even though its rate
 * matches UHUD ($500) — keeps the UI honest about the actual paket name.
 */
export function computeByPaket(rows) {
  let uhud = 0, rahmah = 0, standar = 0, unknown = 0;
  for (const r of rows) {
    const p = (r.paket_detail || '').toString().toLowerCase().trim();
    if (!p) { unknown++; continue; }
    if (p.includes('rahmah')) rahmah++;
    else if (p.includes('standar')) standar++;
    else uhud++;  // default bucket — matches getHajiRate's default rate
  }
  return { uhud, rahmah, standar, unknown };
}

/**
 * Count jamaah by departure state. SUDAH BERANGKAT = departed; else (BELUM,
 * empty, null, etc.) = not yet departed.
 */
export function computeBerangkatStats(rows) {
  let sudah = 0, belum = 0;
  for (const r of rows) {
    if (norm(r.status_berangkat) === 'SUDAH BERANGKAT') sudah++;
    else belum++;
  }
  return { sudahBerangkat: sudah, belumBerangkat: belum };
}
