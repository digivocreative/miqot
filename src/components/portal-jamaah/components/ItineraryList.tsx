import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';

export interface ItineraryDay {
  dayNumber: string;
  title: string;
  date?: string | null;
  location?: string | null;
}

export default function ItineraryList({ items }: { items: ItineraryDay[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = useMemo(() => (expanded ? items : items.slice(0, 3)), [expanded, items]);
  const remaining = Math.max(0, items.length - visibleItems.length);

  if (!items.length) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm">
        <CalendarDays className="mx-auto h-8 w-8 text-slate-300" strokeWidth={2} />
        <p className="mt-3 text-sm font-semibold text-slate-900">Itinerary belum tersedia</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Agent akan membagikan detail perjalanan saat jadwal final.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="space-y-3">
        {visibleItems.map((item, index) => (
          <div key={`${item.dayNumber}-${index}`} className="flex gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-700">
              {item.dayNumber.replace(/^Hari\s*/i, 'D')}
            </div>
            <div className="min-w-0 flex-1 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {[item.date, item.location].filter(Boolean).join(' · ') || 'Detail menyusul'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
        >
          Lihat {remaining} hari lainnya
        </button>
      )}
    </section>
  );
}
