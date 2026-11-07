// Bentuk event /api/calendar/events dan helper murninya. Dipakai bersama oleh
// kartu kalender (UpcomingSchedule) dan sorotan bergilir (calendarSpotlight).

export type CalendarEventType = 'manasik' | 'keberangkatan' | 'kepulangan';

export interface EventDetail {
  jadwal_id: string | null;
  group_number: string | null;
  pesawat: string | null;
  jam: string | null;
  paket: string | null;
  pax: number;
  pax_jamaah: number | null;
  pax_terisi: number | null;
  staff: string | null;
  mutawif: string | null;
  tour_leader: string | null;
  jam_kumpul: string | null;
  titik_kumpul: string | null;
  departure_airport_code: string | null;
  departure_airport_city: string | null;
  departure_terminal: string | null;
  arrival_airport_code: string | null;
  arrival_airport_city: string | null;
  arrival_terminal: string | null;
  itinerary_url: string | null;
}

export interface CalendarEvent {
  date: string;
  type: CalendarEventType;
  details: EventDetail[];
}

// pax legacy = kuota grup nasional, bukan jumlah jamaah. Tampilkan kursi
// terisi nasional (pax_terisi = kuota − sisa) bila baris ter-map ke jadwal;
// fallback ke kuota legacy bila tidak (mis. WAITINGLIST tanpa jadwal padanan).
export function displayPax(d: EventDetail): number {
  return d.pax_terisi ?? d.pax ?? 0;
}

export function hasDisplayableDetail(d: EventDetail): boolean {
  return displayPax(d) > 0 || !!(d.paket || d.pesawat || d.jam || d.group_number);
}

export const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Nama paket manasik dari sistem legacy menempelkan tanggal berangkat grup
// sebagai prefix "DD/MM/YYYYNAMA PAKET" — pisahkan untuk tampilan.
export function parsePaket(paket: string | null): { name: string; departure: string | null } {
  if (!paket) return { name: '-', departure: null };
  const m = paket.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(.+)$/);
  if (!m) return { name: paket, departure: null };
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return { name: paket, departure: null };
  return { name: m[4].trim(), departure: `${parseInt(m[1], 10)} ${SHORT_MONTHS[monthIdx]} ${m[3]}` };
}
