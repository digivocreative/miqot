export type FlightDisplayStatus =
  | 'en-route'
  | 'scheduled'
  | 'landed'
  | 'delayed'
  | 'cancelled'
  | 'unverified';

interface FlightStatusPresentation {
  label: string;
  color: string;
  bg: string;
  badge: string;
}

export const FLIGHT_STATUS_PRESENTATION: Record<FlightDisplayStatus, FlightStatusPresentation> = {
  'en-route': {
    label: 'Terbang',
    color: '#3b82f6',
    bg: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  scheduled: {
    label: 'Terjadwal',
    color: '#d97706',
    // amber-700, bukan -500: teks putih di atas amber-500 hanya 2,15:1 dan nyaru.
    // `color` tetap amber-600 — itu garis tipis penghubung jam, bukan alas teks.
    bg: 'bg-amber-700',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  landed: {
    label: 'Mendarat',
    color: '#10b981',
    bg: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  delayed: {
    label: 'Delay',
    color: '#ef4444',
    bg: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border border-red-200',
  },
  cancelled: {
    label: 'Dibatalkan',
    color: '#dc2626',
    bg: 'bg-red-600',
    badge: 'bg-red-50 text-red-700 border border-red-200',
  },
  unverified: {
    label: 'Perlu Cek',
    color: '#64748b',
    bg: 'bg-slate-500',
    badge: 'bg-slate-50 text-slate-700 border border-slate-200',
  },
};

export function normalizeFlightStatus(status?: string | null): FlightDisplayStatus {
  const normalized = String(status || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FLIGHT_STATUS_PRESENTATION, normalized)
    ? normalized as FlightDisplayStatus
    : 'scheduled';
}

export function getFlightStatusPresentation(status?: string | null): FlightStatusPresentation {
  return FLIGHT_STATUS_PRESENTATION[normalizeFlightStatus(status)];
}
