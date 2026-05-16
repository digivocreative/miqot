import type { ReactNode } from 'react';

export default function PhaseSection({
  label,
  dateLabel,
  done,
  total,
  active = false,
  children,
}: {
  label: string;
  dateLabel: string;
  done: number;
  total: number;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 flex-none rounded-full ${
              active ? 'animate-pulse bg-emerald-600' : 'bg-slate-300'
            }`}
          />
          <div className="min-w-0">
            <p className={`truncate text-sm font-bold ${active ? 'text-emerald-700' : 'text-slate-700'}`}>{label}</p>
            <p className="text-xs text-slate-500">{dateLabel}</p>
          </div>
        </div>
        <span className="flex-none rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {done}/{total}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
