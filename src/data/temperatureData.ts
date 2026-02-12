/**
 * Monthly average temperature data for Mekkah & Madinah
 * Based on historical climate averages (°C)
 */

type MonthlyTemp = { low: number; high: number };

const MEKKAH_TEMPS: Record<number, MonthlyTemp> = {
  1:  { low: 18, high: 30 },
  2:  { low: 18, high: 31 },
  3:  { low: 20, high: 34 },
  4:  { low: 23, high: 38 },
  5:  { low: 26, high: 41 },
  6:  { low: 27, high: 43 },
  7:  { low: 28, high: 43 },
  8:  { low: 28, high: 43 },
  9:  { low: 27, high: 42 },
  10: { low: 24, high: 38 },
  11: { low: 21, high: 34 },
  12: { low: 19, high: 31 },
};

const MADINAH_TEMPS: Record<number, MonthlyTemp> = {
  1:  { low: 10, high: 22 },
  2:  { low: 12, high: 25 },
  3:  { low: 15, high: 29 },
  4:  { low: 20, high: 34 },
  5:  { low: 24, high: 39 },
  6:  { low: 26, high: 42 },
  7:  { low: 27, high: 42 },
  8:  { low: 27, high: 41 },
  9:  { low: 25, high: 40 },
  10: { low: 20, high: 35 },
  11: { low: 15, high: 28 },
  12: { low: 11, high: 23 },
};

export function getTemperature(city: 'mekkah' | 'madinah', month: number): MonthlyTemp {
  const data = city === 'mekkah' ? MEKKAH_TEMPS : MADINAH_TEMPS;
  return data[month] || { low: 0, high: 0 };
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
