// Pure pricing math for the Haji Plus simulation.
// No React / DOM / network — unit-tested in tests/haji-plus-pricing.test.js.

export const PRICE_ESCALATION_RATE = 0.025; // package price growth per year
export const KURS_INFLATION_RATE = 0.015;   // USD->IDR kurs growth per year

/**
 * @typedef {Object} LadderEntry
 * @property {number} year
 * @property {number} priceUSD      Per-jamaah package price in that year.
 * @property {boolean} isDeparture  True for the departure-year row.
 */

/**
 * @param {{ basePriceUSD:number, jumlahJamaah:number, tahunBerangkat:number,
 *           currentYear:number, kursUSD:number, dpPerJamaahUSD:number }} input
 * @returns {import('./hajiPlusPricing').EscalationResult}
 */
export function computeHajiPlusEscalation(input) {
  const { basePriceUSD, jumlahJamaah, tahunBerangkat, currentYear, kursUSD, dpPerJamaahUSD } = input;
  const years = Math.max(1, tahunBerangkat - currentYear);

  const escalatedPriceUSD = basePriceUSD * Math.pow(1 + PRICE_ESCALATION_RATE, years);
  const baseTotalUSD = basePriceUSD * jumlahJamaah;
  const escalatedTotalUSD = escalatedPriceUSD * jumlahJamaah;
  const dpUSD = dpPerJamaahUSD * jumlahJamaah;
  const sisaUSD = escalatedTotalUSD - dpUSD;
  const inflatedKurs = kursUSD * Math.pow(1 + KURS_INFLATION_RATE, years);
  const estTotalIDR = escalatedTotalUSD * inflatedKurs;
  const dpIDR = dpUSD * kursUSD;       // paid now -> today's kurs
  const sisaIDR = sisaUSD * inflatedKurs; // paid at departure -> inflated kurs

  const ladder = [];
  for (let i = 0; i <= years; i++) {
    ladder.push({
      year: i === years ? tahunBerangkat : currentYear + i,
      priceUSD: basePriceUSD * Math.pow(1 + PRICE_ESCALATION_RATE, i),
      isDeparture: i === years,
    });
  }

  return {
    years, basePriceUSD, escalatedPriceUSD, baseTotalUSD, escalatedTotalUSD,
    dpUSD, sisaUSD, inflatedKurs, estTotalIDR, dpIDR, sisaIDR, ladder,
  };
}

/**
 * Reduce a ladder to at most `maxRows` evenly-spaced entries, always keeping the
 * first (today) and last (departure) rows.
 * @param {LadderEntry[]} ladder
 * @param {number} [maxRows=5]
 * @returns {LadderEntry[]}
 */
export function condenseLadder(ladder, maxRows = 5) {
  if (ladder.length <= maxRows) return ladder.slice();
  const last = ladder.length - 1;
  const indices = [];
  for (let i = 0; i < maxRows; i++) indices.push(Math.round((i * last) / (maxRows - 1)));
  return [...new Set(indices)].map(i => ladder[i]);
}
