/**
 * Keterlambatan yang relevan untuk ringkasan kartu penerbangan, menurut fase.
 *
 * AirLabs mengirim dua angka berbeda: `depDelayed` (`delayed` = alias lama)
 * untuk lepas landas, dan `arrDelayed` untuk tiba. Sebelum berangkat yang
 * ditunggu orang adalah jam lepas landas. Begitu pesawat mengudara, delay
 * keberangkatan tinggal sejarah — yang penting jam tiba.
 *
 * Contoh nyata (EK358, 6 Nov 2026): lepas landas +3 menit tapi diperkirakan
 * tiba 27 menit LEBIH AWAL. Badge "+3m" pada kartu yang sedang terbang
 * terbaca seolah pesawatnya akan telat.
 */

import { normalizeFlightStatus } from './flightStatusPresentation';

export type FlightDelayPhase = 'departure' | 'arrival';

export interface FlightDelay {
  minutes: number;
  phase: FlightDelayPhase;
}

interface FlightDelayInput {
  status?: string | null;
  depActual?: string | null;
  delayed?: number | null;
  depDelayed?: number | null;
  arrDelayed?: number | null;
}

function positiveMinutes(value: unknown): number {
  const minutes = Math.round(Number(value));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

/** Sudah lepas landas: status terbang/mendarat, atau provider sudah mencatat jam lepas landas. */
export function flightHasDeparted(flight?: Pick<FlightDelayInput, 'status' | 'depActual'> | null): boolean {
  if (!flight) return false;
  const status = normalizeFlightStatus(flight.status);
  return status === 'en-route' || status === 'landed' || Boolean(flight.depActual);
}

export function flightPhaseDelay(flight?: FlightDelayInput | null): FlightDelay | null {
  if (!flight) return null;
  const status = normalizeFlightStatus(flight.status);
  if (status === 'cancelled') return null;

  const departed = flightHasDeparted(flight);
  const minutes = departed
    ? positiveMinutes(flight.arrDelayed)
    : positiveMinutes(flight.depDelayed) || positiveMinutes(flight.delayed);

  return minutes > 0 ? { minutes, phase: departed ? 'arrival' : 'departure' } : null;
}

export function flightDelayHint(delay: FlightDelay): string {
  return delay.phase === 'arrival'
    ? `Diperkirakan tiba terlambat ${delay.minutes} menit`
    : `Keberangkatan terlambat ${delay.minutes} menit`;
}
