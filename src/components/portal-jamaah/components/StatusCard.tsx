import type { LucideIcon } from 'lucide-react';

export default function StatusCard({
  icon: Icon,
  label,
  value,
  subtext,
  onClick,
  tone = 'emerald',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subtext: string;
  onClick?: () => void;
  tone?: 'emerald' | 'amber' | 'slate';
}) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[128px] rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-emerald-100"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="h-4 w-4" strokeWidth={2} />
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{subtext}</p>
    </button>
  );
}
