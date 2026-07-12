import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

export interface ItineraryDay {
  dayNumber: string;
  title: string;
  date?: string | null;
  location?: string | null;
}

function compactDayLabel(dayNumber: string, index: number): string {
  const numericDay = dayNumber.match(/\d+/)?.[0];
  return `D${numericDay || index + 1}`;
}

export default function ItineraryList({ items, itineraryUrl }: { items: ItineraryDay[]; itineraryUrl?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = useMemo(() => (expanded ? items : items.slice(0, 3)), [expanded, items]);
  const hiddenCount = Math.max(0, items.length - 3);

  if (!items.length) {
    return (
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <CalendarDays className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" strokeWidth={2} />
        <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">Itinerary belum tersedia</p>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Agent akan membagikan detail perjalanan saat jadwal final.</p>
        {itineraryUrl && (
          <a
            href={itineraryUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={2} />
            Buka itinerary lengkap
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="space-y-3">
        {visibleItems.map((item, index) => (
          <div key={`${item.dayNumber}-${index}`} className="flex gap-3">
            <div
              title={item.dayNumber}
              className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-xl bg-emerald-50 px-1 text-center text-xs font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
            >
              {compactDayLabel(item.dayNumber, index)}
            </div>
            <div className="min-w-0 flex-1 border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-slate-700">
              <p className="break-words text-sm font-semibold text-gray-900 dark:text-white">{item.title}</p>
              <p className="mt-1 break-words text-xs leading-5 text-gray-500 dark:text-slate-400">
                {[item.date, item.location].filter(Boolean).join(' · ') || 'Detail menyusul'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" strokeWidth={2} />
              Ringkas itinerary
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
              Lihat {hiddenCount} hari lainnya
            </>
          )}
        </button>
      )}

      {itineraryUrl && (
        <a
          href={itineraryUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={2} />
          Buka itinerary lengkap
        </a>
      )}
    </section>
  );
}
