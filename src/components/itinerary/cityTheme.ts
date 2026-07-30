export type CityKey = 'mekkah' | 'madinah' | 'dubai' | 'turki' | 'mesir' | 'transit' | 'home';

// D9 (2026-07-30). Emas Dubai JANGAN dicerahkan (#9C7A00=4.04:1 gagal AA).
// Semua nilai lolos ≥4.5:1 di atas putih.
export const CITY_HEX: Record<CityKey, string> = {
  mekkah: '#2A5C9A', madinah: '#1F5F4B', dubai: '#8A6D12', turki: '#8A0F0A',
  mesir: '#6B3FA0', transit: '#556072', home: '#3D4451',
};

export const CITY_LABEL: Record<CityKey, string> = {
  mekkah: 'Mekkah', madinah: 'Madinah', dubai: 'Dubai', turki: 'Turki',
  mesir: 'Mesir', transit: 'Transit', home: 'Indonesia',
};

export const DEFAULT_CITY: CityKey = 'transit';

/** Garis rail: warna kota pada alpha ~22% */
export function railColor(key: CityKey): string {
  return `${CITY_HEX[key]}38`;
}
