export interface HotelMetadata {
  /** Jarak ke pelataran masjid. Bintang hotel sengaja tidak disimpan lagi. */
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
  'ANJUM': { distance: '±450m' },
  'PULLMAN ZAMZAM': { distance: '±50m' },
  'MOVENPICK': { distance: '±100m' },
  'JUMEIRAH JABAL OMAR MAKKAH': { distance: '±250m' },
  'PRESTIGE EX ELAF AL MASHAER': { distance: '±300m' },
  'PRESTIGE': { distance: '±300m' },
  'ELAF AL MASHAER': { distance: '±300m' },
  'AL MASSA GRAND': { distance: '±400m' },
  'AL MASSA DAR AL FAYZEEN': { distance: '±420m' },
  'ROYAL MAJESTIC': { distance: '±300m' },
  'RAYYANA AJYAD': { distance: '±300m' },
  'SOFWAH ROYAL ORCHID': { distance: '±50m' },
  'SAJA MAKKAH EX LE MERIDIEN TOWERS MAKKAH': { distance: '±2.5km' },
  'MAYSAN AL MAQAM EX FAJAR BADEA 2': { distance: '±500m' },
  'AL MARWA RAYHAAN BY ROTANA': { distance: '±150m' },

  // Madinah
  'AL HARAM': { distance: '±50m' },
  'DEYAR AL EIMAN': { distance: '±50m' },
  'AL RITZ AL MADINAH': { distance: '±150m' },
  'GRAND PLAZA': { distance: '±150m' },
  'ODST ALMADINAH': { distance: '±200m' },
  'ODST AL MADINAH': { distance: '±200m' },
  'ARTAL INTERNATIONAL': { distance: '±700m' },
  'ANWAR ALMADINAH MOVENPICK': { distance: '±200m' },
  'ANWAR AL MADINAH MOVENPICK': { distance: '±200m' },
  'PROVINCE ALSHAM': { distance: '±350m' },
  'PROVINCE AL SHAM': { distance: '±350m' },
  'TRIPLE ONE': { distance: '±600m' },

  // Extension city hotels. Distances are broad package-display estimates to the
  // main tour area/landmark, used only when the schedule source has no distance.
  'TIBA PYRAMID': { distance: '±2km' },
  'GAWHARET AL AHRAM HOTEL': { distance: '±2km' },
  'PYRAMIDS GEM PLAZA': { distance: '±2km' },
  'IBIS DUBAI ALBARSHA': { distance: '±1.5km' },
  'ANATOLIA': { distance: '±3km' },
  'TRIO SUITES': { distance: '±6km' },
  'CENTRO WESTSIDE BY ROTANA': { distance: '±18km' },
  'RAMADA ALIBEYKOY': { distance: '±7km' },
  'KAYSERI LOFT HOTEL': { distance: '±6km' },
  'DOUBLE TREE BY HILTON HOTEL AVANOS': { distance: '±2km' },
  'CROWNE PLAZA': { distance: '±3km' },
  'TURIST HOTEL': { distance: '±1km' },
  'CONNECT HOTEL': { distance: '±25km' },
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
