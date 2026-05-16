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
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Plane className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">{label}</p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:bg-slate-700 dark:text-slate-200">
              {code}
            </span>
          </div>
          <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">{route}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{time}</p>
          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-slate-400">
            {airline} · {note}
          </p>
        </div>
      </div>
    </section>
  );
}
