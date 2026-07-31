import { Users, PlaneTakeoff, PlaneLanding, CircleDot, type LucideIcon } from 'lucide-react';
import { classifyActivity, activityIconName, cityKeyForLocation, splitImportantPlaces, retitleDayWithDate } from '../../../lib/itinerary-view.js';
import { CITY_HEX, DEFAULT_CITY, type CityKey } from './cityTheme';

// Ikon HANYA untuk momen bermakna (kumpul/takeoff/landing/transit) — baris biasa
// tampil polos sebagai lembar jam+teks supaya highlight benar-benar menonjol.
const ICONS: Record<string, LucideIcon> = {
  'users': Users,
  'plane-takeoff': PlaneTakeoff,
  'plane-landing': PlaneLanding,
};

const BADGE_TEXT: Record<string, string> = {
  kumpul: 'TITIK KUMPUL', takeoff: 'TAKE OFF', landing: 'LANDING', transit: 'TRANSIT',
};

// Nama tempat penting ditebalkan supaya baris aktivitas bisa dipindai sekilas —
// jamaah biasanya mencari "di mana", bukan membaca kalimatnya utuh. Dirender
// sebagai potongan teks, bukan innerHTML: isinya berasal dari PDF pihak ketiga.
function ActivityText({ text }: { text: string }) {
  const parts = splitImportantPlaces(text) as Array<{ text: string; bold: boolean }>;
  return (
    <>
      {parts.map((part, i) => (
        part.bold ? <strong key={i} className="font-bold">{part.text}</strong> : <span key={i}>{part.text}</span>
      ))}
    </>
  );
}

export interface ItineraryDayData {
  dayNumber: string;
  title: string;
  location?: string | null;
  activities: Array<{ time: string; text: string } | string>;
}

interface Props {
  day: ItineraryDayData;
  dayIndex: number;
  /** Tanggal hari ini (YYYY-MM-DD) dihitung dari jadwal, bukan dari judul PDF. */
  dayDateISO?: string | null;
}

export default function DayRail({ day, dayIndex, dayDateISO }: Props) {
  const cityKey = (cityKeyForLocation(day.location || '') || DEFAULT_CITY) as CityKey;
  const dayNum = day.dayNumber?.match(/\d[\d\-–]*/)?.[0] || String(dayIndex + 1);

  // Judul PDF sering SUDAH berupa tanggal, dan tanggal itu bisa salah. Ditulis
  // ulang dari jadwal; kalau judulnya memang tanggal, baris bawah tak lagi
  // mengulanginya supaya tak tampil dua kali di kartu yang sama.
  const { title, hadDate } = retitleDayWithDate(day.title, dayDateISO) as { title: string; hadDate: boolean };
  const dateLabel = !hadDate && dayDateISO
    ? new Date(`${dayDateISO}T00:00:00Z`).toLocaleDateString('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
    : null;

  return (
    <section className="mx-3 mt-2.5 overflow-hidden rounded-2xl border border-[#EAE2D8] bg-white">
      {/* Header hari — chip angka burgundy sebagai jangkar (tanpa serif) */}
      <div className="flex items-center gap-2.5 border-b border-[#F1EAE1] px-3.5 py-2.5">
        <span className="flex h-8 min-w-[32px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-burgundy px-1.5 text-[14px] font-extrabold text-white">
          {dayNum}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-itin-ink">{title}</div>
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-itin-ink3">
            {day.location && (
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: CITY_HEX[cityKey] }}
              />
            )}
            <span className="truncate">{[day.location, dateLabel].filter(Boolean).join('  ·  ')}</span>
          </div>
        </div>
      </div>
      {/* Timeline: satu garis tenang + titik per baris; momen penting = panel emas */}
      <div className="relative px-3.5 py-3">
        <span aria-hidden className="absolute bottom-4 left-[61.5px] top-4 w-px bg-[#EFE7DC]" />
        {day.activities.map((raw, i) => {
          const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
          const kind = classifyActivity(act.text, { dayIndex, activityIndex: i });
          const highlight = kind !== 'regular';
          const showTime = act.time && act.time !== '-';

          if (!highlight) {
            return (
              <div key={i} className="flex pb-3.5 last:pb-0">
                <span className="w-[44px] shrink-0 pt-px text-[12.5px] font-bold tabular-nums text-[#8A0F0A]">
                  {showTime ? act.time : ''}
                </span>
                <span className="relative z-10 mr-2.5 mt-[5px] h-2 w-2 shrink-0 rounded-full border-2 border-[#C9B18A] bg-white" />
                <p className="min-w-0 text-[13.5px] leading-[1.5] text-itin-ink">
                  <ActivityText text={act.text} />
                </p>
              </div>
            );
          }

          const Icon = ICONS[activityIconName(kind, act.text)] || CircleDot;
          return (
            <div key={i} className="relative z-10 mb-3.5 rounded-xl bg-gold-50 px-3 py-2.5 last:mb-0">
              <div className="flex items-center gap-2">
                <Icon size={14} className="shrink-0 text-[#8A0F0A]" />
                {showTime && (
                  <span className="text-[12.5px] font-bold tabular-nums text-[#8A0F0A]">{act.time}</span>
                )}
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-[#6B550C]">
                  {BADGE_TEXT[kind]}
                </span>
              </div>
              <p className="mt-1 text-[13.5px] font-medium leading-[1.45] text-itin-ink">
                <ActivityText text={act.text} />
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
