/**
 * Monthly average temperature data for cities visited on Umroh packages
 * Based on historical climate averages (°C)
 */

type MonthlyTemp = { low: number; high: number };

const CITY_TEMPS: Record<string, Record<number, MonthlyTemp>> = {
  mekkah: {
    1: { low: 18, high: 30 }, 2: { low: 18, high: 31 }, 3: { low: 20, high: 34 },
    4: { low: 23, high: 38 }, 5: { low: 26, high: 41 }, 6: { low: 27, high: 43 },
    7: { low: 28, high: 43 }, 8: { low: 28, high: 43 }, 9: { low: 27, high: 42 },
    10: { low: 24, high: 38 }, 11: { low: 21, high: 34 }, 12: { low: 19, high: 31 },
  },
  madinah: {
    1: { low: 10, high: 22 }, 2: { low: 12, high: 25 }, 3: { low: 15, high: 29 },
    4: { low: 20, high: 34 }, 5: { low: 24, high: 39 }, 6: { low: 26, high: 42 },
    7: { low: 27, high: 42 }, 8: { low: 27, high: 41 }, 9: { low: 25, high: 40 },
    10: { low: 20, high: 35 }, 11: { low: 15, high: 28 }, 12: { low: 11, high: 23 },
  },
  cairo: {
    1: { low: 9, high: 19 }, 2: { low: 10, high: 21 }, 3: { low: 12, high: 24 },
    4: { low: 15, high: 28 }, 5: { low: 19, high: 33 }, 6: { low: 22, high: 35 },
    7: { low: 24, high: 36 }, 8: { low: 24, high: 35 }, 9: { low: 22, high: 33 },
    10: { low: 18, high: 30 }, 11: { low: 14, high: 25 }, 12: { low: 10, high: 20 },
  },
  alexandria: {
    1: { low: 9, high: 18 }, 2: { low: 10, high: 19 }, 3: { low: 11, high: 21 },
    4: { low: 14, high: 24 }, 5: { low: 17, high: 27 }, 6: { low: 21, high: 30 },
    7: { low: 23, high: 30 }, 8: { low: 24, high: 31 }, 9: { low: 22, high: 30 },
    10: { low: 18, high: 27 }, 11: { low: 14, high: 23 }, 12: { low: 10, high: 19 },
  },
  istanbul: {
    1: { low: 3, high: 9 }, 2: { low: 3, high: 9 }, 3: { low: 5, high: 12 },
    4: { low: 8, high: 17 }, 5: { low: 13, high: 22 }, 6: { low: 17, high: 26 },
    7: { low: 20, high: 29 }, 8: { low: 20, high: 29 }, 9: { low: 16, high: 25 },
    10: { low: 12, high: 20 }, 11: { low: 8, high: 15 }, 12: { low: 5, high: 11 },
  },
  bursa: {
    1: { low: 0, high: 8 }, 2: { low: 1, high: 10 }, 3: { low: 3, high: 13 },
    4: { low: 7, high: 19 }, 5: { low: 11, high: 24 }, 6: { low: 15, high: 28 },
    7: { low: 17, high: 31 }, 8: { low: 17, high: 31 }, 9: { low: 13, high: 27 },
    10: { low: 9, high: 21 }, 11: { low: 5, high: 14 }, 12: { low: 2, high: 9 },
  },
  ankara: {
    1: { low: -3, high: 4 }, 2: { low: -2, high: 6 }, 3: { low: 1, high: 11 },
    4: { low: 6, high: 17 }, 5: { low: 10, high: 22 }, 6: { low: 14, high: 26 },
    7: { low: 17, high: 30 }, 8: { low: 17, high: 30 }, 9: { low: 12, high: 26 },
    10: { low: 7, high: 20 }, 11: { low: 2, high: 12 }, 12: { low: -1, high: 6 },
  },
  cappadocia: {
    1: { low: -5, high: 3 }, 2: { low: -4, high: 5 }, 3: { low: 0, high: 11 },
    4: { low: 5, high: 17 }, 5: { low: 9, high: 21 }, 6: { low: 13, high: 26 },
    7: { low: 16, high: 30 }, 8: { low: 16, high: 30 }, 9: { low: 11, high: 25 },
    10: { low: 6, high: 19 }, 11: { low: 1, high: 11 }, 12: { low: -3, high: 5 },
  },
  dubai: {
    1: { low: 15, high: 24 }, 2: { low: 16, high: 25 }, 3: { low: 18, high: 28 },
    4: { low: 21, high: 33 }, 5: { low: 25, high: 38 }, 6: { low: 28, high: 40 },
    7: { low: 30, high: 42 }, 8: { low: 31, high: 42 }, 9: { low: 27, high: 39 },
    10: { low: 23, high: 35 }, 11: { low: 19, high: 30 }, 12: { low: 16, high: 26 },
  },
  aqsha: { // Jerusalem
    1: { low: 5, high: 12 }, 2: { low: 5, high: 13 }, 3: { low: 7, high: 16 },
    4: { low: 10, high: 21 }, 5: { low: 14, high: 26 }, 6: { low: 17, high: 28 },
    7: { low: 19, high: 30 }, 8: { low: 19, high: 30 }, 9: { low: 17, high: 28 },
    10: { low: 14, high: 25 }, 11: { low: 10, high: 19 }, 12: { low: 6, high: 14 },
  },
  amman: {
    1: { low: 4, high: 13 }, 2: { low: 4, high: 14 }, 3: { low: 7, high: 17 },
    4: { low: 10, high: 23 }, 5: { low: 14, high: 28 }, 6: { low: 18, high: 31 },
    7: { low: 20, high: 33 }, 8: { low: 20, high: 33 }, 9: { low: 18, high: 31 },
    10: { low: 14, high: 26 }, 11: { low: 9, high: 19 }, 12: { low: 5, high: 14 },
  },
  petra: {
    1: { low: 3, high: 13 }, 2: { low: 4, high: 14 }, 3: { low: 7, high: 18 },
    4: { low: 11, high: 23 }, 5: { low: 15, high: 28 }, 6: { low: 18, high: 32 },
    7: { low: 20, high: 34 }, 8: { low: 20, high: 34 }, 9: { low: 17, high: 31 },
    10: { low: 14, high: 26 }, 11: { low: 8, high: 19 }, 12: { low: 4, high: 14 },
  },
  haikou: { // Hainan, China
    1: { low: 15, high: 21 }, 2: { low: 16, high: 23 }, 3: { low: 19, high: 26 },
    4: { low: 23, high: 30 }, 5: { low: 25, high: 33 }, 6: { low: 26, high: 34 },
    7: { low: 26, high: 35 }, 8: { low: 25, high: 34 }, 9: { low: 24, high: 32 },
    10: { low: 22, high: 29 }, 11: { low: 19, high: 26 }, 12: { low: 16, high: 22 },
  },
};

/**
 * Get temperature for a city and month.
 * City key should be lowercase (matching API hotel key prefix).
 */
export function getTemperature(city: string, month: number): MonthlyTemp | null {
  const data = CITY_TEMPS[city.toLowerCase()];
  if (!data) return null;
  return data[month] || null;
}

/**
 * Check if temperature data exists for a city
 */
export function hasTemperatureData(city: string): boolean {
  return city.toLowerCase() in CITY_TEMPS;
}

/**
 * Returns Tailwind color classes based on how hot it is
 */
export function getTempColor(highTemp: number): { text: string; icon: string } {
  if (highTemp >= 39) {
    return { text: 'text-red-600 dark:text-red-400', icon: 'text-red-500' };
  }
  if (highTemp >= 30) {
    return { text: 'text-amber-600 dark:text-amber-400', icon: 'text-amber-500' };
  }
  return { text: 'text-emerald-600 dark:text-emerald-400', icon: 'text-emerald-500' };
}

/**
 * Monthly average temperature (single value) for CuacaWidget bar chart.
 * Format: [Jan, Feb, Mar, Apr, Mei, Jun, Jul, Agt, Sep, Okt, Nov, Des]
 */
export const cityTemperatureData: Record<string, number[]> = {
  makkah:     [22, 25, 28, 32, 37, 41, 43, 43, 40, 36, 29, 23],
  madinah:    [20, 23, 27, 30, 35, 38, 40, 40, 37, 32, 26, 21],
  istanbul:   [5,  6,  8,  13, 18, 23, 26, 26, 22, 16, 10, 6 ],
  cappadocia: [2,  3,  6,  10, 15, 19, 22, 22, 18, 12, 7,  3 ],
  dubai:      [19, 21, 24, 28, 33, 36, 38, 39, 36, 32, 26, 21],
  hainan:     [19, 20, 23, 26, 29, 30, 30, 30, 29, 27, 23, 20],
};
