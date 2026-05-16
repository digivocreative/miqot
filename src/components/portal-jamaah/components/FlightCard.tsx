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
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Plane className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {code}
            </span>
          </div>
          <p className="mt-2 text-lg font-bold text-slate-950">{route}</p>
          <p className="mt-1 text-sm text-slate-600">{time}</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {airline} · {note}
          </p>
        </div>
      </div>
    </section>
  );
}
