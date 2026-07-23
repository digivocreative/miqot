import { useEffect, useMemo, useState } from 'react';
import { Plane } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import FlightCard from '../components/FlightCard';
import HotelCard from '../components/HotelCard';
import ItineraryList, { type ItineraryDay } from '../components/ItineraryList';
import type { PortalMeData } from '../hooks/usePortalMe';
import { formatPortalTime, formatShortDate, tripDurationDays } from '../utils/formatDate';
import { extractItineraryDays } from '../utils/itinerary';
import { Card, InvertedPanel, PortalPageShell, SectionLabel, StatusChip } from '../ui';

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
  return raw.replace(/\s*[-–>,→]\s*/g, ' → ');
}

function routeNote(route?: string | null) {
  const raw = String(route || '');
  const separators = (raw.match(/[-–>,]/g) || []).length;
  return separators <= 1 ? 'Direct' : 'Transit';
}

function detectRoomType(paket?: string | null) {
  const lower = String(paket || '').toLowerCase();
  if (lower.includes('single')) return 'Single';
  if (lower.includes('double')) return 'Double';
  if (lower.includes('triple')) return 'Triple';
  if (lower.includes('quad') || lower.includes('quard')) return 'Quad';
  return null;
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
  if (typeof value === 'string') return value.replace(/\s*\([★⭐]\s*\d\s*\)\s*$/u, '').trim() || 'Hotel menyusul';
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return String(obj.hotel || obj.name || obj.nama || 'Hotel menyusul').trim() || 'Hotel menyusul';
  }
  return 'Hotel menyusul';
}

function hotelEntries(paketHotel: unknown, paketName?: string | null) {
  const raw = typeof paketHotel === 'string' ? JSON.parse(paketHotel || '{}') : paketHotel;
  if (!raw || typeof raw !== 'object') return [];
  const root = raw as Record<string, unknown>;
  const rootKeys = Object.keys(root);
  const hasFlatCityFields = rootKeys.some((key) => /^(madinah|makkah|mekkah)(?:_hotel)?$/i.test(key));
  const normalizedPackage = String(paketName || '').toLocaleLowerCase('id-ID');
  const matchingTierKey = rootKeys.find((key) => normalizedPackage.includes(key.toLocaleLowerCase('id-ID')));
  const selectedTier = hasFlatCityFields ? root : root[matchingTierKey || rootKeys[0]];
  if (!selectedTier || typeof selectedTier !== 'object') return [];

  const tier = selectedTier as Record<string, unknown>;
  const roomType = detectRoomType(paketName);
  const formatLocation = (distance: unknown, mosque: string) => {
    const rawDistance = String(distance || '').trim();
    if (!rawDistance) return `Area ${mosque}`;
    return /masjid|dari|from/i.test(rawDistance) ? rawDistance : `${rawDistance} dari ${mosque}`;
  };
  const cities = [
    {
      city: 'Madinah',
      value: tier.madinah_hotel ?? tier.madinah,
      distance: tier.madinah_jarak,
      mosque: 'Masjid Nabawi',
    },
    {
      city: 'Makkah',
      value: tier.makkah_hotel ?? tier.mekkah_hotel ?? tier.makkah ?? tier.mekkah,
      distance: tier.makkah_jarak ?? tier.mekkah_jarak,
      mosque: 'Masjidil Haram',
    },
  ];

  return cities
    .filter(({ value }) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(({ city, value, distance, mosque }) => ({
      city,
      name: parseHotelName(value),
      location: formatLocation(distance, mosque),
      duration: 'Detail malam mengikuti itinerary',
      roomType,
    }));
}

export default function PerjalananPage({
  slug,
  data,
  onBack,
}: {
  slug: string;
  data: PortalMeData;
  onBack: () => void;
}) {
  const [fallbackItinerary, setFallbackItinerary] = useState<ItineraryDay[]>([]);
  const schedule = data.schedule;
  const packageName = data.booking.jadwal?.jadwal_nama || data.booking.paket || 'Paket Umroh';
  const displayPackageName = formatPackageTitle(packageName);
  const departureCode = schedule?.berangkat_kode_penerbangan || 'TBA';
  const returnCode = schedule?.pulang_kode_penerbangan || 'TBA';
  const scheduledAirline = String(schedule?.maskapai || '').trim();
  const departureAirline = scheduledAirline || airlineFromCode(departureCode);
  const returnAirline = scheduledAirline || airlineFromCode(returnCode);
  const duration = tripDurationDays(data.booking.tgl_berangkat, data.booking.tgl_pulang);
  const itineraryItems = useMemo(
    () => extractItineraryDays(schedule?.itinerary, data.booking.tgl_berangkat),
    [schedule?.itinerary, data.booking.tgl_berangkat]
  );
  const hotels = useMemo(() => {
    try {
      return hotelEntries(schedule?.paket_hotel, data.booking.paket || packageName);
    } catch {
      return [];
    }
  }, [schedule?.paket_hotel, data.booking.paket, packageName]);

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
    <PortalPageShell>
      <PortalBackBar title="Perjalanan" onBack={onBack} icon={Plane} iconClassName="bg-burgundy-700/8 text-burgundy-700" />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <InvertedPanel className="p-5" texture ring>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold">Paket</p>
          <h1 className="mt-2 break-words font-display text-2xl leading-tight [overflow-wrap:anywhere]">{displayPackageName}</h1>
          <p className="mt-2 break-words text-sm font-medium text-white/70 [overflow-wrap:anywhere]">
            {data.booking.jadwal?.year_code || new Date().getFullYear()} · {departureAirline}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/50">Berangkat</p>
              <p className="mt-1 break-words font-mono text-sm font-semibold leading-tight tabular-nums">{formatShortDate(data.booking.tgl_berangkat)}</p>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/50">Pulang</p>
              <p className="mt-1 break-words font-mono text-sm font-semibold leading-tight tabular-nums">{formatShortDate(data.booking.tgl_pulang)}</p>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/50">Durasi</p>
              <p className="mt-1 break-words font-mono text-sm font-semibold leading-tight tabular-nums">{duration ? `${duration} hari` : 'Menyusul'}</p>
            </div>
          </div>
        </InvertedPanel>

        <section>
          <SectionLabel className="mb-3">Penerbangan</SectionLabel>
          <div className="space-y-3">
            <FlightCard
              label="Keberangkatan"
              route={normalizeRoute(schedule?.berangkat_rute)}
              code={departureCode}
              time={formatPortalTime(schedule?.berangkat_jam)}
              airline={departureAirline}
              note={routeNote(schedule?.berangkat_rute)}
            />
            <FlightCard
              label="Pulang"
              route={normalizeRoute(schedule?.pulang_rute)}
              code={returnCode}
              time={formatPortalTime(schedule?.pulang_jam)}
              airline={returnAirline}
              note={routeNote(schedule?.pulang_rute)}
            />
          </div>
        </section>

        <section>
          <SectionLabel className="mb-3">Hotel</SectionLabel>
          {hotels.length ? (
            <div className="space-y-3">
              {hotels.map((hotel) => (
                <HotelCard key={`${hotel.city}-${hotel.name}`} {...hotel} />
              ))}
            </div>
          ) : (
            <Card className="p-5 text-sm text-ink/60">
              Detail hotel akan tampil setelah agent merilis paket final.
            </Card>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <SectionLabel className="min-w-0">Itinerary Harian</SectionLabel>
            <StatusChip status="brand" className="flex-none">Rencana perjalanan</StatusChip>
          </div>
          <ItineraryList items={visibleItinerary} itineraryUrl={schedule?.itinerary_url} slug={slug} />
        </section>
      </main>
    </PortalPageShell>
  );
}
