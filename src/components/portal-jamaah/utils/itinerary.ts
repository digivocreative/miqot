import { addDays, formatShortDate } from './formatDate';
import type { ItineraryDay } from '../components/ItineraryList';

export type { ItineraryDay };

// Normalisasi itinerary mentah (schedule.itinerary bertipe unknown / bisa {days:[]})
// menjadi daftar hari terstruktur. Dipindah dari PerjalananPage agar dipakai ulang.
export function extractItineraryDays(raw: unknown, startDate?: string | null): ItineraryDay[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { days?: unknown[] }).days)
      ? (raw as { days: unknown[] }).days
      : [];
  return source.map((item, index) => {
    const day = item as Record<string, unknown>;
    return {
      dayNumber: String(day.dayNumber || day.day || `Hari ${index + 1}`),
      title: String(day.title || day.judul || 'Agenda perjalanan'),
      date: day.date ? String(day.date) : formatShortDate(addDays(startDate, index)),
      location: day.location ? String(day.location) : null,
    };
  });
}
