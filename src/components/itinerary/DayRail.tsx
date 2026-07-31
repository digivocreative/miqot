import { Users, PlaneTakeoff, PlaneLanding, Bus, TrainFront, MapPin, Route, CircleDot, type LucideIcon } from 'lucide-react';
import { classifyActivity, activityIconName, cityKeyForLocation, cityKeysInOrder, splitImportantPlaces, retitleDayWithDate, splitDayTitleDate, isRedundantDayLocation } from '../../../lib/itinerary-view.js';
import { CITY_HEX, CITY_FLAG, DEFAULT_CITY, type CityKey } from './cityTheme';

// Ikon HANYA untuk momen bermakna (kumpul/takeoff/landing/transit) — baris biasa
// tampil polos sebagai lembar jam+teks supaya highlight benar-benar menonjol.
const ICONS: Record<string, LucideIcon> = {
  'users': Users,
  'plane-takeoff': PlaneTakeoff,
  'plane-landing': PlaneLanding,
  'bus': Bus,
  'train-front': TrainFront,
  'map-pin': MapPin,
  'route': Route,
};

// LANDING/TAKE OFF hanya untuk penerbangan sungguhan; pindah kota lewat darat
// (Madinah↔Mekkah, antar kota paket plus) memakai badge bus/kereta, dan yang
// modanya tak disebut PDF memakai label netral TIBA/PERJALANAN.
const BADGE_TEXT: Record<string, string> = {
  kumpul: 'TITIK KUMPUL', takeoff: 'TAKE OFF', landing: 'LANDING', transit: 'TRANSIT',
  bus: 'PERJALANAN BUS', kereta: 'KERETA CEPAT', tiba: 'TIBA', perjalanan: 'PERJALANAN',
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

  // Hari perpindahan antarnegara ("Makkah – Jeddah – Istanbul") menampilkan
  // bendera KEDUA negara, urut arah perjalanan. Dedup per aset bendera —
  // Mekkah/Madinah/Jeddah sama-sama Saudi, jangan tampil dobel. Fallback ke
  // bendera cityKey supaya hari tanpa location tetap berbendera seperti semula.
  const flagSrcs = [...new Set(
    (cityKeysInOrder(day.location || '') as CityKey[])
      .map(k => CITY_FLAG[k])
      .filter((src): src is string => Boolean(src)),
  )].slice(0, 2);
  if (!flagSrcs.length && CITY_FLAG[cityKey]) flagSrcs.push(CITY_FLAG[cityKey] as string);

  // Tanggal di judul PDF bisa salah → ditulis ulang dari jadwal, lalu DIPINDAH
  // ke baris bawah supaya judul tak memanjang sampai terpotong ("Jakarta –
  // Madinah (Sabtu, 05 Septemb…"). Kalau judul aslinya hanya tanggal, lokasi
  // naik menjadi judul.
  const { title: retitled } = retitleDayWithDate(day.title, dayDateISO) as { title: string };
  const { rest, dateText } = splitDayTitleDate(retitled) as { rest: string; dateText: string | null };
  const title = rest || day.location || dateText || day.title;
  const dateLabel = dateText
    ? (title === dateText ? null : dateText)
    : dayDateISO
      ? new Date(`${dayDateISO}T00:00:00Z`).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
      })
      : null;
  // Judul "Mekkah" + baris bawah "Mekkah · tanggal" = redundan; lokasi hanya
  // tampil bila menambah informasi di luar judul.
  const showLocation = Boolean(day.location) && !isRedundantDayLocation(title, day.location);
  const subtitle = [showLocation ? day.location : null, dateLabel].filter(Boolean).join('  ·  ');

  return (
    <section className="mx-3 mt-2.5 overflow-hidden rounded-2xl border border-[#EAE2D8] bg-white">
      {/* Header hari — chip angka burgundy sebagai jangkar (tanpa serif) */}
      <div className="relative flex items-center gap-2.5 border-b border-[#F1EAE1] px-3.5 py-2.5">
        <span className="flex h-8 min-w-[32px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-burgundy px-1.5 text-[14px] font-extrabold text-white">
          {dayNum}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-itin-ink">{title}</div>
          {subtitle && (
            <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-itin-ink3">
              {showLocation && (
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: CITY_HEX[cityKey] }}
                />
              )}
              <span className="truncate">{subtitle}</span>
            </div>
          )}
        </div>
        {/* Bendera negara hari ini — aset sama dengan kartu jadwal, samar saja.
            Absolut agar hampir setinggi header tanpa membuat barisnya melar.
            Hari dua negara: bendera ditumpuk vertikal (asal di atas, tujuan di
            bawah) — berdampingan memakan lebar dan menimpa judul panjang
            ("Makkah – Jeddah – Istanbul") di layar 375px. */}
        {flagSrcs.length > 0 && (
          <div
            aria-hidden
            className={`absolute inset-y-1 right-2 flex ${flagSrcs.length > 1 ? 'flex-col justify-center gap-[3px]' : 'items-center'}`}
          >
            {flagSrcs.map(src => (
              <img
                key={src}
                src={src}
                alt=""
                className={`w-auto opacity-30 ${flagSrcs.length > 1 ? 'h-[calc(50%-3px)] rounded' : 'h-full rounded-md'}`}
              />
            ))}
          </div>
        )}
      </div>
      {/* Timeline: satu garis tenang + titik per baris; momen penting = panel emas */}
      <div className="relative px-3.5 py-3">
        <span aria-hidden className="absolute bottom-4 left-[61.5px] top-4 w-px bg-[#EFE7DC]" />
        {(() => {
          // PDF sering menulis jam yang sama di baris beruntun ("07:00" enam kali
          // untuk satu rangkaian ziarah) — tampilkan hanya saat jamnya berubah.
          let lastShownTime = '';
          return day.activities.map((raw, i) => {
          const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
          const kind = classifyActivity(act.text, { dayIndex, activityIndex: i });
          const highlight = kind !== 'regular';
          const hasTime = Boolean(act.time && act.time !== '-');
          const showTime = hasTime && act.time !== lastShownTime;
          if (showTime) lastShownTime = act.time;

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
          });
        })()}
      </div>
    </section>
  );
}
