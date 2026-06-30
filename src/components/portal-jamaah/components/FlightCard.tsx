import { Plane } from 'lucide-react';

export default function FlightCard({
  label,
  route,
  code,
  time,
  airline,
  note,
}: {
  label: string;
  route: string;
  code: string;
  time: string;
  airline: string;
  note: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          <Plane className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
            <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs font-bold text-gray-700 dark:bg-slate-700 dark:text-slate-200">
              {code}
            </span>
          </div>
          <p className="mt-2 text-sm font-bold leading-snug text-gray-900 dark:text-white">{route}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{time}</p>
          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-slate-400">
            {airline} · {note}
          </p>
        </div>
      </div>
    </section>
  );
}
