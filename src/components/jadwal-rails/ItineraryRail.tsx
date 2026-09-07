import { ChevronDown, FileText, Maximize2, Route } from 'lucide-react';
import { useState } from 'react';

import { useItineraryContent } from '@/hooks/useItineraryContent';
import { dayHeadline, nightsByCity, type ItineraryActivity } from '@/lib/itineraryRail';
import { extraHotelsOf } from '@/lib/packageDetail';
import type { UmrohPackage } from '@/types';
import { getPackageJourneySteps } from '@/utils/journey';

interface Props {
  pkg: UmrohPackage;
  /** Slug agent — dipakai untuk tautan "Buka penuh" ke tampilan web itinerary. */
  agentSlug?: string | null;
}

const CARD = 'rounded-2xl bg-white shadow-[0_6px_22px_-8px_rgba(58,42,31,0.15)] dark:bg-slate-900 dark:shadow-black/40';

/** Aktivitas datang sebagai string polos ATAU {time, text} — sumbernya PDF. */
function activityText(activity: ItineraryActivity | string): string {
  if (typeof activity === 'string') return activity;
  const time = String(activity.time || '').trim();
  const text = String(activity.text || '').trim();
  return time && text ? `${time} · ${text}` : text || time;
}

/**
 * Rail kiri — rencana perjalanan paket yang sedang dibahas.
 *
 * Tiga keadaan, dan semuanya HARUS terisi. Itinerary datang dari PDF yang
 * disinkronkan berkala, jadi "belum tersedia" adalah kondisi normal, bukan
 * kegagalan: di situ rail jatuh ke rantai kota dari journeyOrder yang selalu
 * ada di payload paket.
 */
export default function ItineraryRail({ pkg, agentSlug }: Props) {
  const { state, days } = useItineraryContent(pkg.jadwalId);
  const [openDay, setOpenDay] = useState<number | null>(null);

  const nights = state === 'ready' ? nightsByCity(days) : [];
  const shareHref = agentSlug
    ? `/${agentSlug}/${pkg.jadwalId}/itinerary`
    : `/${pkg.jadwalId}/itinerary`;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-start justify-between gap-3 bg-[#FAF7F5] px-4 py-3.5 dark:bg-slate-800/60">
        <div className="min-w-0">
          <p className="text-[8.5px] font-extrabold uppercase tracking-[0.12em] text-[#A08A7C] dark:text-slate-400">
            Rencana perjalanan
          </p>
          <p className="mt-0.5 text-[15px] font-bold text-[#1E1512] dark:text-white">
            {state === 'ready'
              ? `${days.length} Hari · ${nights.length} Kota`
              : 'Rantai perjalanan'}
          </p>
        </div>
        <a
          href={shareHref}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E9E1DD] bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-[#63564D] transition-colors hover:bg-[#FAF7F5] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Buka penuh
          <Maximize2 size={11} />
        </a>
      </div>

      {nights.length > 0 && (
        <div className="flex gap-2 border-b border-[#F1EAE1] bg-[#FAF7F5] px-4 pb-3.5 dark:border-slate-800 dark:bg-slate-800/60">
          {nights.map(({ city, nights: n }) => (
            <div
              key={city}
              className="flex-1 rounded-[9px] border border-[#EFE7E1] bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            >
              <p className="truncate text-[11px] font-bold text-[#8A0F0A] dark:text-rose-300">{city}</p>
              <p className="text-[9.5px] text-[#8C7C70] dark:text-slate-400">{n} malam</p>
            </div>
          ))}
        </div>
      )}

      {state === 'loading' && (
        // Skeleton setinggi daftar hari sungguhan: menahan tinggi rail supaya
        // tidak melompat saat isinya mendarat.
        <div className="space-y-1 p-3.5" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <div className="h-[30px] w-[30px] shrink-0 animate-pulse rounded-[9px] bg-[#F1EAE1] dark:bg-slate-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-[#F1EAE1] dark:bg-slate-800" />
                <div className="h-2 w-3/4 animate-pulse rounded bg-[#F6F1ED] dark:bg-slate-800/60" />
              </div>
            </div>
          ))}
        </div>
      )}

      {state === 'ready' && (
        <ol className="p-3.5">
          {days.map((day, idx) => {
            const isOpen = openDay === idx;
            const activities = day.activities ?? [];
            const headline = dayHeadline(day);
            return (
              <li key={`${day.dayNumber}-${idx}`}>
                <button
                  type="button"
                  onClick={() => setOpenDay(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-3 rounded-[11px] px-2 py-2 text-left transition-colors ${
                    isOpen ? 'bg-[#FBF5F4] dark:bg-slate-800/70' : 'hover:bg-[#FAF7F5] dark:hover:bg-slate-800/40'
                  }`}
                >
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-gradient-burgundy text-[13px] font-extrabold text-white">
                    {day.dayNumber?.match(/\d+/)?.[0] ?? idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-[#1E1512] dark:text-white">
                      {headline.primary || `Hari ${idx + 1}`}
                    </span>
                    {headline.secondary && (
                      <span className="block truncate text-[9.5px] text-[#8C7C70] dark:text-slate-400">
                        {headline.secondary}
                      </span>
                    )}
                  </span>
                  {activities.length > 0 && (
                    <ChevronDown
                      size={13}
                      className={`shrink-0 text-[#B6AEA7] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>

                {isOpen && activities.length > 0 && (
                  <ul className="mb-1 ml-[26px] space-y-1.5 border-l border-[#EFE7E1] py-2 pl-4 dark:border-slate-700">
                    {activities.map((activity, i) => (
                      <li key={i} className="text-[10.5px] leading-snug text-[#63564D] dark:text-slate-300">
                        {activityText(activity)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {state === 'unavailable' && (
        // Jalur degradasi: rantai kota selalu bisa dihitung dari payload paket,
        // jadi rail tidak pernah kosong walau PDF-nya belum tersinkron.
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-[#8C7C70] dark:text-slate-400">
            <Route size={13} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em]">Rantai perjalanan</p>
          </div>
          <ol className="space-y-2.5">
            {getPackageJourneySteps(pkg, extraHotelsOf(pkg.hotel?.[Object.keys(pkg.hotel || {})[0]], pkg.hotel).map((h) => h.city)).map(
              (step, idx) => (
                <li key={`${step.label}-${idx}`} className="flex items-center gap-2.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      step.tone === 'umroh'
                        ? 'bg-[#8A0F0A]'
                        : step.tone === 'madinah'
                          ? 'bg-emerald-600'
                          : 'bg-[#D8A15C]'
                    }`}
                  />
                  <span className="text-[12.5px] font-semibold text-[#1E1512] dark:text-white">{step.label}</span>
                </li>
              ),
            )}
          </ol>
          <p className="mt-4 text-[10.5px] leading-snug text-[#8C7C70] dark:text-slate-400">
            Rincian hari per hari belum tersedia untuk paket ini.
          </p>
          {pkg.itineraryUrl && (
            <a
              href={pkg.itineraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-[11px] border border-[#E9E1DD] bg-white py-2.5 text-[12px] font-semibold text-[#63564D] transition-colors hover:bg-[#FAF7F5] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <FileText size={13} />
              Buka itinerary PDF
            </a>
          )}
        </div>
      )}
    </div>
  );
}
