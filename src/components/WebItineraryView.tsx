// Tampilan web itinerary — rail waktu, light-only (spec 2026-07-30).
// Menggantikan versi lama yang dead-code: warna berputar per hari, isDark dibaca
// sekali saat render (bug dark-mode), location tak dirender (cacat #1–#7 spec).
import { AlertCircle, FileText } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import JourneyStrip from './itinerary/JourneyStrip';
import DayRail, { type ItineraryDayData } from './itinerary/DayRail';
import FlightCard from './itinerary/FlightCard';
import HotelCard from './itinerary/HotelCard';
import AgentFooter from './itinerary/AgentFooter';

export interface ItineraryContent {
  days: ItineraryDayData[];
}

interface Props {
  content: ItineraryContent | null;
  loading: boolean;
  error: string | null;
  paket?: UmrohPackage | null;
  agentSlug?: string | null;
  agentName?: string | null;
  agentPhone?: string | null;
  agentPhoto?: string | null;
  onRetryPdf?: () => void;
  onWaClick?: () => void;
}

function buildRouteText(paket?: UmrohPackage | null): string | null {
  const clean = (rute?: string) => rute?.replace(/\s*\/\s*|\s*-\s*|\s*–\s*/g, ' → ');
  const dep = clean(paket?.keberangkatan?.rute);
  const ret = clean(paket?.kepulangan?.rute);
  if (!dep && !ret) return null;
  return [dep, ret ? `pulang ${ret}` : null].filter(Boolean).join('  ·  ');
}

function dayDate(paket: UmrohPackage | null | undefined, dayIndex: number): string | null {
  const tgl = paket?.keberangkatan?.tgl;
  if (!tgl) return null;
  const d = new Date(tgl);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + dayIndex);
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function WebItineraryView({
  content, loading, error, paket, agentSlug, agentName, agentPhone, agentPhoto, onRetryPdf, onWaClick,
}: Props) {
  if (loading) {
    return (
      <div className="bg-white px-4 py-5" aria-busy>
        <div className="h-24 animate-pulse rounded-2xl bg-itin-canvas" />
        {[0, 1, 2].map(i => (
          <div key={i} className="mt-5 flex gap-3">
            <div className="h-3 w-3 animate-pulse rounded-full bg-itin-line" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-itin-line" />
              <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-itin-canvas" />
            </div>
          </div>
        ))}
        <p className="mt-6 text-center text-[10px] text-itin-ink3">
          Membaca PDF & menyusun itinerary… bisa sampai 1 menit untuk paket baru.
        </p>
      </div>
    );
  }

  const days = content?.days;
  // Kosong = error (spec State): jangan pernah membuat pengguna kandas — PDF selalu jalan keluar.
  if (error || !days?.length) {
    return (
      <div className="flex flex-col items-center bg-white px-6 py-14 text-center">
        <AlertCircle size={22} className="text-itin-ink3" />
        <p className="mt-2 text-sm font-semibold text-itin-ink">Tampilan web belum tersedia</p>
        <p className="mt-1 max-w-[260px] text-xs leading-5 text-itin-ink3">
          {error || 'Itinerary belum bisa disusun otomatis.'} Dokumen PDF tetap bisa dibuka.
        </p>
        {onRetryPdf && (
          <button
            type="button"
            onClick={onRetryPdf}
            className="mt-4 flex items-center gap-2 rounded-xl border border-itin-line px-4 py-2 text-xs font-bold text-itin-ink2"
          >
            <FileText size={14} /> Buka dokumen PDF
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white pb-4">
      <div className="pt-3.5">
        <JourneyStrip days={days} routeText={buildRouteText(paket)} />
      </div>
      <div className="mt-3.5">
        {days.map((day, i) => (
          <DayRail key={i} day={day} dayIndex={i} dateLabel={dayDate(paket, i)} />
        ))}
      </div>
      <div className="mt-4 space-y-3.5 px-4">
        {paket && <FlightCard paket={paket} />}
        {paket?.hotel && <HotelCard hotel={paket.hotel} />}
        <AgentFooter
          agentSlug={agentSlug ?? null}
          agentName={agentName ?? null}
          agentPhone={agentPhone ?? null}
          agentPhoto={agentPhoto ?? null}
          paketNama={paket?.nama || ''}
          onWaClick={onWaClick}
        />
      </div>
    </div>
  );
}
