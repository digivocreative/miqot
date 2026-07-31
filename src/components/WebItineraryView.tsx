// Tampilan web itinerary — rail waktu, light-only (spec 2026-07-30).
// Menggantikan versi lama yang dead-code: warna berputar per hari, isDark dibaca
// sekali saat render (bug dark-mode), location tak dirender (cacat #1–#7 spec).
import { AlertCircle, FileText } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import { classifyActivity } from '../../lib/itinerary-view.js';
import JourneyStrip from './itinerary/JourneyStrip';
import DayRail, { type ItineraryDayData } from './itinerary/DayRail';
import FlightCard from './itinerary/FlightCard';
import HotelCard from './itinerary/HotelCard';

export interface ItineraryContent {
  days: ItineraryDayData[];
}

interface Props {
  content: ItineraryContent | null;
  loading: boolean;
  error: string | null;
  paket?: UmrohPackage | null;
  onRetryPdf?: () => void;
}

function isoToUtc(value: string | null | undefined): Date | null {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Tanggal hari ke-N dihitung dari berangkat_tgl, bukan dibaca dari judul PDF —
 * judul PDF bisa salah (lihat retitleDayWithDate). Aritmetikanya UTC supaya
 * tidak bergeser sehari di zona waktu negatif.
 *
 * Mengembalikan null untuk SEMUA hari kalau jumlah hari itinerary tidak sama
 * dengan rentang berangkat→pulang. Kalau keduanya tak cocok, kita tidak tahu
 * hari mana yang hilang atau berlebih, dan menebak berarti memasang tanggal
 * salah di semua kartu — lebih baik menahan diri, sama seperti
 * computeNightSegments yang memilih menghilang ketimbang salah.
 */
function dayDatesISO(paket: UmrohPackage | null | undefined, dayCount: number): (string | null)[] {
  const none = Array.from({ length: dayCount }, () => null);
  const start = isoToUtc(paket?.keberangkatan?.tgl);
  if (!start || dayCount < 1) return none;

  const end = isoToUtc(paket?.kepulangan?.tgl);
  if (end) {
    const span = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (span !== dayCount) return none;
  }

  return Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// Jam tiba tak ada di data paket — ambil dari baris LANDING itinerary: landing di paruh
// awal perjalanan = kedatangan berangkat, landing terakhir di paruh akhir = kedatangan pulang.
function extractArrivalTimes(days: ItineraryDayData[]): { berangkat: string | null; pulang: string | null } {
  const landings: Array<{ time: string; dayIndex: number }> = [];
  days.forEach((day, di) => day.activities.forEach((raw, ai) => {
    const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
    if (!act.time || act.time === '-') return;
    if (classifyActivity(act.text, { dayIndex: di, activityIndex: ai }) === 'landing') {
      landings.push({ time: act.time, dayIndex: di });
    }
  }));
  const half = days.length / 2;
  return {
    berangkat: landings.find(l => l.dayIndex < half)?.time ?? null,
    pulang: [...landings].reverse().find(l => l.dayIndex >= half)?.time ?? null,
  };
}

export default function WebItineraryView({
  content, loading, error, paket, onRetryPdf,
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
        <p className="mt-6 text-center text-[11.5px] text-itin-ink3">
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

  const dayISO = dayDatesISO(paket, days.length);

  return (
    <div className="bg-[#F6F1EA] pb-4">
      <div className="pt-3">
        <JourneyStrip days={days} pdfUrl={paket?.itineraryUrl} />
      </div>
      <div>
        {dayISO.map((iso, i) => (
          <DayRail key={i} day={days[i]} dayIndex={i} dayDateISO={iso} />
        ))}
      </div>
      <div className="mt-2.5 space-y-2.5 px-3">
        {paket && <FlightCard paket={paket} arrivals={extractArrivalTimes(days)} />}
        {paket?.hotel && <HotelCard hotel={paket.hotel} />}
      </div>
    </div>
  );
}
