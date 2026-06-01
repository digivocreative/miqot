export const PRICE_ESCALATION_RATE: 0.025;
export const KURS_INFLATION_RATE: 0.015;

export interface LadderEntry {
  year: number;
  priceUSD: number;
  isDeparture: boolean;
}

export interface EscalationInput {
  basePriceUSD: number;
  jumlahJamaah: number;
  tahunBerangkat: number;
  currentYear: number;
  kursUSD: number;
  dpPerJamaahUSD: number;
}

export interface EscalationResult {
  years: number;
  basePriceUSD: number;
  escalatedPriceUSD: number;
  baseTotalUSD: number;
  escalatedTotalUSD: number;
  dpUSD: number;
  sisaUSD: number;
  inflatedKurs: number;
  estTotalIDR: number;
  dpIDR: number;
  sisaIDR: number;
  ladder: LadderEntry[];
}

export function computeHajiPlusEscalation(input: EscalationInput): EscalationResult;
export function condenseLadder(ladder: LadderEntry[], maxRows?: number): LadderEntry[];
