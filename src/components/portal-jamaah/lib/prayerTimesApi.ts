// Jadwal solat Portal Jamaah — fetch + cache dari Aladhan API (CORS `*`, dipanggil
// langsung dari browser tanpa proxy backend, pola lib/quranApi.ts).
import {
  buildTimingsUrl,
  formatHijri,
  PRAYER_ORDER,
  type PrayerCityId,
  type PrayerName,
} from '../../../../lib/prayer-times.js';

export type { PrayerCityId };
export type Timings = Record<PrayerName, string>;

export interface CityPrayerData {
  timings: Timings;
  hijriLabel: string | null;
}

const CACHE_PREFIX = 'portal_prayer';
const memoryCache = new Map<string, CityPrayerData>();

function hasAllTimings(timings: unknown): timings is Timings {
  return !!timings && PRAYER_ORDER.every((name) => typeof (timings as Record<string, unknown>)[name] === 'string');
}

interface AladhanResponse {
  code: number;
  data?: {
    timings?: Record<string, string>;
    date?: { hijri?: Parameters<typeof formatHijri>[0] };
  };
}

function pickTimings(raw: Record<string, string> | undefined): Timings {
  if (!raw) throw new Error('Timings kosong');
  const out = {} as Timings;
  for (const name of PRAYER_ORDER) {
    if (!raw[name]) throw new Error(`Waktu ${name} tidak ada`);
    out[name] = raw[name];
  }
  return out;
}

export async function fetchCityTimings(cityId: PrayerCityId, dateKey: string): Promise<CityPrayerData> {
  const key = `${CACHE_PREFIX}_${cityId}_${dateKey}`;

  const mem = memoryCache.get(key);
  if (mem) return mem;

  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached) as CityPrayerData;
      if (hasAllTimings(parsed?.timings)) {
        memoryCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // localStorage tak tersedia / korup — abaikan, ambil dari jaringan.
  }

  const res = await fetch(buildTimingsUrl(cityId, dateKey));
  if (!res.ok) throw new Error(`Gagal memuat jadwal solat (${res.status})`);
  const json = (await res.json()) as AladhanResponse;

  const data: CityPrayerData = {
    timings: pickTimings(json.data?.timings),
    hijriLabel: formatHijri(json.data?.date?.hijri),
  };

  memoryCache.set(key, data);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // penyimpanan penuh / mode privat — cukup andalkan memory cache.
  }
  return data;
}
