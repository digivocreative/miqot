import { useEffect, useMemo, useState } from 'react';
import PortalBackBar from '../components/PortalBackBar';
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
  return null;
}

function detectRoomKey(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('double')) return 'double';
  if (lower.includes('triple')) return 'triple';
  if (lower.includes('quad')) return 'quad';
  return '';
}

function formatPackageTitle(value?: string | null) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Paket Umroh';

  return raw
    .toLocaleLowerCase('id-ID')
    .split(' ')
    .map((token) =>
      /\d/.test(token)
        ? token.toLocaleUpperCase('id-ID')
        : token.replace(/[a-zA-Z][a-zA-Z']*/g, (word) => word.charAt(0).toLocaleUpperCase('id-ID') + word.slice(1))
    )
    .join(' ');
}

function parseHotelName(value: unknown) {
  if (typeof value === 'string') return value.replace(/\s*\([★⭐]\d\)\s*$/u, '').trim() || 'Hotel menyusul';
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
      duration: 'Detail malam mengikuti itinerary',
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

export default function PerjalananPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [fallbackItinerary, setFallbackItinerary] = useState<ItineraryDay[]>([]);
  const schedule = data.schedule;
  const packageName = data.booking.jadwal?.jadwal_nama || data.booking.paket || 'Paket Umroh';
  const displayPackageName = formatPackageTitle(packageName);
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
    return () => { cancelled = true; };
  }, [data.booking.jadwal?.jadwal_id, data.booking.tgl_berangkat, itineraryItems.length, schedule?.itinerary_url]);

  const visibleItinerary = itineraryItems.length ? itineraryItems : fallbackItinerary;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Perjalanan" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-24 pt-5">
        <section
          className="rounded-2xl p-5 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0F6E56 50%, #065f46 100%)' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Paket</p>
          <h1 className="mt-2 text-xl font-bold leading-tight tracking-tight">{displayPackageName}</h1>
          <p className="mt-2 text-sm font-medium text-emerald-100">
            {data.booking.jadwal?.year_code || new Date().getFullYear()} · {airlineFromCode(departureCode)}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/20 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Berangkat</p>
              <p className="mt-1 text-sm font-bold">{formatShortDate(data.booking.tgl_berangkat)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Pulang</p>
              <p className="mt-1 text-sm font-bold">{formatShortDate(data.booking.tgl_pulang)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Durasi</p>
              <p className="mt-1 text-sm font-bold">{duration ? `${duration} hari` : 'Menyusul'}</p>
            </div>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Penerbangan</p>
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
          <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hotel</p>
          {hotels.length ? (
            <div className="space-y-3">
              {hotels.map((hotel) => (
                <HotelCard key={`${hotel.city}-${hotel.name}`} {...hotel} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Detail hotel akan tampil setelah agent merilis paket final.
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Itinerary Harian</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
              Rencana perjalanan
            </span>
          </div>
          <ItineraryList items={visibleItinerary} itineraryUrl={schedule?.itinerary_url} />
        </section>
      </main>
    </div>
  );
}
