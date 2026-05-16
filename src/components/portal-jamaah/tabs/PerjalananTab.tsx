import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Sparkles } from 'lucide-react';
import PortalTopBar from '../components/PortalTopBar';
import FlightCard from '../components/FlightCard';
import HotelCard from '../components/HotelCard';
import ItineraryList, { type ItineraryDay } from '../components/ItineraryList';
import type { PortalMeData } from '../hooks/usePortalMe';
import { addDays, formatPortalTime, formatShortDate, tripDurationDays } from '../utils/formatDate';

function airlineFromCode(code?: string | null) {
  const prefix = String(code || '').trim().slice(0, 2).toUpperCase();
  const airlines: Record<string, string> = {
    SV: 'Saudia',
    GA: 'Garuda Indonesia',
    QR: 'Qatar Airways',
    EK: 'Emirates',
    EY: 'Etihad',
    WY: 'Oman Air',
    JT: 'Lion Air',
  };
  return airlines[prefix] || 'Maskapai';
}

function normalizeRoute(route?: string | null) {
  const raw = String(route || '').trim();
  if (!raw) return 'Rute menyusul';
  return raw.replace(/\s*[-–>]\s*/g, ' -> ');
}

function routeNote(route?: string | null) {
  const raw = String(route || '');
  const separators = (raw.match(/[-–>,]/g) || []).length;
  return separators <= 1 ? 'Direct' : 'Transit';
}

function detectRoomType(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('double')) return 'Double';
  if (lower.includes('triple')) return 'Triple';
  if (lower.includes('quad')) return 'Quad';
  return 'Tipe kamar sesuai paket';
}

function detectRoomKey(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('double')) return 'double';
  if (lower.includes('triple')) return 'triple';
  if (lower.includes('quad')) return 'quad';
  return '';
}

function parseHotelName(value: unknown) {
  if (typeof value === 'string') {
    return value.replace(/\s*\([★⭐]\d\)\s*$/u, '').trim() || 'Hotel menyusul';
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return String(obj.hotel || obj.name || obj.nama || 'Hotel menyusul');
  }
  return 'Hotel menyusul';
}

function hotelEntries(paketHotel: unknown, paketName?: string | null) {
  const raw = typeof paketHotel === 'string' ? JSON.parse(paketHotel || '{}') : paketHotel;
  if (!raw || typeof raw !== 'object') return [];

  const root = raw as Record<string, unknown>;
  const roomKey = detectRoomKey(paketName);
  const tier = (roomKey && root[roomKey]) || root[Object.keys(root)[0]];
  if (!tier || typeof tier !== 'object') return [];

  return Object.entries(tier as Record<string, unknown>)
    .filter(([city]) => /madinah|mekkah|makkah/i.test(city))
    .map(([city, value]) => ({
      city: /madinah/i.test(city) ? 'Madinah' : 'Makkah',
      name: parseHotelName(value),
      location: /madinah/i.test(city) ? 'Area Masjid Nabawi' : 'Area Masjidil Haram',
      duration: 'Durasi sesuai itinerary',
      roomType: detectRoomType(paketName),
    }));
}

function extractItineraryDays(raw: unknown, startDate?: string | null): ItineraryDay[] {
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

export default function PerjalananTab({ data }: { data: PortalMeData }) {
  const [fallbackItinerary, setFallbackItinerary] = useState<ItineraryDay[]>([]);
  const schedule = data.schedule;
  const packageName = data.booking.paket || data.booking.jadwal?.jadwal_nama || 'Paket Umroh';
  const departureCode = schedule?.berangkat_kode_penerbangan || 'TBA';
  const returnCode = schedule?.pulang_kode_penerbangan || 'TBA';
  const duration = tripDurationDays(data.booking.tgl_berangkat, data.booking.tgl_pulang);
  const itineraryItems = useMemo(
    () => extractItineraryDays(schedule?.itinerary, data.booking.tgl_berangkat),
    [schedule?.itinerary, data.booking.tgl_berangkat]
  );
  const hotels = useMemo(() => {
    try {
      return hotelEntries(schedule?.paket_hotel, packageName);
    } catch {
      return [];
    }
  }, [schedule?.paket_hotel, packageName]);

  useEffect(() => {
    const jadwalId = data.booking.jadwal?.jadwal_id;
    if (itineraryItems.length || !jadwalId) return;

    let cancelled = false;
    const url = new URL(`/api/itinerary/${encodeURIComponent(String(jadwalId))}`, window.location.origin);
    if (schedule?.itinerary_url) url.searchParams.set('pdfUrl', schedule.itinerary_url);
    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) {
          setFallbackItinerary(extractItineraryDays(json.data, data.booking.tgl_berangkat));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [data.booking.jadwal?.jadwal_id, data.booking.tgl_berangkat, itineraryItems.length, schedule?.itinerary_url]);

  const visibleItinerary = itineraryItems.length ? itineraryItems : fallbackItinerary;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 font-sans text-slate-900">
      <PortalTopBar agent={data.agent} title="Perjalanan" />
      <main className="mx-auto w-full max-w-md space-y-5 px-4 pb-28 pt-5">
        <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Paket</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal">{packageName}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {data.booking.jadwal?.year_code || new Date().getFullYear()} · {airlineFromCode(departureCode)}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Berangkat</p>
              <p className="mt-1 text-sm font-semibold">{formatShortDate(data.booking.tgl_berangkat)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pulang</p>
              <p className="mt-1 text-sm font-semibold">{formatShortDate(data.booking.tgl_pulang)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Durasi</p>
              <p className="mt-1 text-sm font-semibold">{duration ? `${duration} hari` : 'Menyusul'}</p>
            </div>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Penerbangan</p>
          <div className="space-y-3">
            <FlightCard
              label="Pergi"
              route={normalizeRoute(schedule?.berangkat_rute)}
              code={departureCode}
              time={formatPortalTime(schedule?.berangkat_jam)}
              airline={airlineFromCode(departureCode)}
              note={routeNote(schedule?.berangkat_rute)}
            />
            <FlightCard
              label="Pulang"
              route={normalizeRoute(schedule?.pulang_rute)}
              code={returnCode}
              time={formatPortalTime(schedule?.pulang_jam)}
              airline={airlineFromCode(returnCode)}
              note={routeNote(schedule?.pulang_rute)}
            />
          </div>
        </section>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hotel</p>
          {hotels.length ? (
            <div className="space-y-3">
              {hotels.map((hotel) => (
                <HotelCard key={`${hotel.city}-${hotel.name}`} {...hotel} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 text-sm text-slate-500 shadow-sm">
              Detail hotel akan tampil setelah agent merilis paket final.
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Itinerary Harian</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700">
              <Sparkles className="h-3 w-3" strokeWidth={2} />
              AI-generated
            </span>
          </div>
          <ItineraryList items={visibleItinerary} />
          {schedule?.itinerary_url && (
            <a
              href={schedule.itinerary_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <CalendarDays className="h-4 w-4" strokeWidth={2} />
              Buka itinerary lengkap
            </a>
          )}
          <p className="sr-only">paket_hotel</p>
        </section>
      </main>
    </div>
  );
}
