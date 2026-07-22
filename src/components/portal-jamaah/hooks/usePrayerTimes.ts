import { useEffect, useState } from 'react';
import { fetchCityTimings, type CityPrayerData, type PrayerCityId } from '../lib/prayerTimesApi';
import { extractItineraryDays } from '../utils/itinerary';
import { getRiyadhNow, resolvePrimaryCity, tripDayIndex } from '../../../../lib/prayer-times.js';
import type { PortalBooking, PortalSchedule } from './usePortalMe';

export type CityStatus = 'loading' | 'ready' | 'error';

export interface CityState {
  status: CityStatus;
  data: CityPrayerData | null;
}

export interface PrayerTimesState {
  dateKey: string;
  primaryCity: PrayerCityId;
  cities: Record<PrayerCityId, CityState>;
}

const CITY_IDS: PrayerCityId[] = ['mekkah', 'madinah'];

export function usePrayerTimes(schedule: PortalSchedule | null, booking: PortalBooking): PrayerTimesState {
  const now = getRiyadhNow(Date.now());
  const [dateKey, setDateKey] = useState(now.dateKey);
  const [cities, setCities] = useState<Record<PrayerCityId, CityState>>({
    mekkah: { status: 'loading', data: null },
    madinah: { status: 'loading', data: null },
  });

  const itineraryDays = extractItineraryDays(schedule?.itinerary, booking.tgl_berangkat);
  const dayIndex = tripDayIndex(booking.tgl_berangkat, booking.tgl_pulang, now.isoDate);
  const primaryCity = resolvePrimaryCity({ itineraryDays, dayIndex });

  // Muat kedua kota untuk hari Riyadh aktif.
  useEffect(() => {
    let cancelled = false;
    for (const cityId of CITY_IDS) {
      setCities((prev) => ({ ...prev, [cityId]: { status: 'loading', data: prev[cityId].data } }));
      fetchCityTimings(cityId, dateKey)
        .then((data) => {
          if (!cancelled) setCities((prev) => ({ ...prev, [cityId]: { status: 'ready', data } }));
        })
        .catch(() => {
          if (!cancelled) setCities((prev) => ({ ...prev, [cityId]: { status: 'error', data: prev[cityId].data } }));
        });
    }
    return () => { cancelled = true; };
  }, [dateKey]);

  // Ganti hari (zona Riyadh) → set dateKey baru → efek di atas memuat ulang.
  useEffect(() => {
    function check() {
      const next = getRiyadhNow(Date.now()).dateKey;
      setDateKey((current) => (current === next ? current : next));
    }
    const id = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(id); window.removeEventListener('focus', check); };
  }, []);

  return { dateKey, primaryCity, cities };
}
