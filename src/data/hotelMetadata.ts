export interface HotelMetadata {
  stars?: string;
  distance?: string;
}

export function normalizeHotelName(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/\s*\/\s*SETARAF.*$/, '')
    .replace(/\s+\/\s+/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const HOTEL_METADATA: Record<string, HotelMetadata> = {
  // Mekkah
  'ANJUM': { stars: '5', distance: '±450m' },
  'PULLMAN ZAMZAM': { stars: '5', distance: '±50m' },
  'MOVENPICK': { stars: '5', distance: '±100m' },
  'JUMEIRAH JABAL OMAR MAKKAH': { stars: '5', distance: '±250m' },
  'PRESTIGE EX ELAF AL MASHAER': { stars: '5', distance: '±300m' },
  'PRESTIGE': { stars: '5', distance: '±300m' },
  'ELAF AL MASHAER': { stars: '5', distance: '±300m' },
  'AL MASSA GRAND': { stars: '4', distance: '±400m' },
  'AL MASSA DAR AL FAYZEEN': { stars: '4', distance: '±420m' },
  'ROYAL MAJESTIC': { stars: '4', distance: '±300m' },
  'RAYYANA AJYAD': { stars: '4', distance: '±300m' },
  'SOFWAH ROYAL ORCHID': { stars: '5', distance: '±50m' },
  'SAJA MAKKAH EX LE MERIDIEN TOWERS MAKKAH': { stars: '5', distance: '±2.5km' },

  // Madinah
  'AL HARAM': { stars: '4', distance: '±50m' },
  'DEYAR AL EIMAN': { stars: '4', distance: '±50m' },
  'AL RITZ AL MADINAH': { stars: '4', distance: '±150m' },
  'GRAND PLAZA': { stars: '4', distance: '±150m' },
  'ODST ALMADINAH': { stars: '3', distance: '±200m' },
  'ODST AL MADINAH': { stars: '3', distance: '±200m' },
  'ARTAL INTERNATIONAL': { stars: '4', distance: '±700m' },
  'ANWAR ALMADINAH MOVENPICK': { stars: '5', distance: '±200m' },
  'ANWAR AL MADINAH MOVENPICK': { stars: '5', distance: '±200m' },
  'PROVINCE ALSHAM': { stars: '4', distance: '±350m' },
  'PROVINCE AL SHAM': { stars: '4', distance: '±350m' },
  'TRIPLE ONE': { stars: '3', distance: '±600m' },

  // Extension city hotels. Distances are broad package-display estimates to the
  // main tour area/landmark, used only when the schedule source has no distance.
  'TIBA PYRAMID': { stars: '4', distance: '±2km' },
  'IBIS DUBAI ALBARSHA': { stars: '3', distance: '±1.5km' },
  'ANATOLIA': { stars: '4', distance: '±3km' },
  'TRIO SUITES': { stars: '4', distance: '±6km' },
  'CENTRO WESTSIDE BY ROTANA': { stars: '5', distance: '±18km' },
  'RAMADA ALIBEYKOY': { stars: '4', distance: '±7km' },
  'KAYSERI LOFT HOTEL': { stars: '4', distance: '±6km' },
  'DOUBLE TREE BY HILTON HOTEL AVANOS': { stars: '5', distance: '±2km' },
  'CROWNE PLAZA': { stars: '5', distance: '±3km' },
  'TURIST HOTEL': { stars: '4', distance: '±1km' },
  'CONNECT HOTEL': { stars: '5', distance: '±25km' },
};

export function lookupHotelMetadata(name: string): HotelMetadata {
  const normalized = normalizeHotelName(name);
  if (!normalized) return {};

  const exact = HOTEL_METADATA[normalized];
  if (exact) return exact;

  for (const [key, meta] of Object.entries(HOTEL_METADATA)) {
    if (normalized.includes(key) || key.includes(normalized)) return meta;
  }
  return {};
}
