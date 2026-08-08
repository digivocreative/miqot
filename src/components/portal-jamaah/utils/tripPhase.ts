import type { PortalBooking } from '../hooks/usePortalMe';
import { daysUntilDate } from './formatDate';

export type TripPhase = 'pra' | 'perjalanan' | 'pasca';

export interface TripPhaseInfo {
  phase: TripPhase;
  /** Hari menuju berangkat (negatif = sudah lewat); null bila tanggal tak diketahui. */
  daysToBerangkat: number | null;
  /** Hari ke-N perjalanan (hari berangkat = hari ke-1); hanya terisi pada fase 'perjalanan'. */
  tripDayNumber: number | null;
}

// Umroh berjalan ±9–16 hari; bila tgl_pulang tak tersedia, lewat batas ini dianggap pasca.
const MAX_TRIP_DAYS_WITHOUT_RETURN = 45;

export function deriveTripPhase(booking: PortalBooking): TripPhaseInfo {
  const fromApi = booking.hari_ke_berangkat;
  const daysToBerangkat = typeof fromApi === 'number' && Number.isFinite(fromApi)
    ? fromApi
    : daysUntilDate(booking.tgl_berangkat);
  const daysToPulang = daysUntilDate(booking.tgl_pulang);

  if (daysToBerangkat === null || daysToBerangkat > 0) {
    return { phase: 'pra', daysToBerangkat, tripDayNumber: null };
  }

  const tripDayNumber = -daysToBerangkat + 1;
  if (daysToPulang !== null) {
    return daysToPulang >= 0
      ? { phase: 'perjalanan', daysToBerangkat, tripDayNumber }
      : { phase: 'pasca', daysToBerangkat, tripDayNumber: null };
  }
  return tripDayNumber <= MAX_TRIP_DAYS_WITHOUT_RETURN
    ? { phase: 'perjalanan', daysToBerangkat, tripDayNumber }
    : { phase: 'pasca', daysToBerangkat, tripDayNumber: null };
}
