import type { PortalJamaah } from '../hooks/usePortalMe';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'J';
}

export default function RosterItem({ jamaah, progressPct }: { jamaah: PortalJamaah; progressPct: number }) {
  const ready = progressPct >= 80;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">
        {initials(jamaah.nama)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">{jamaah.nama}</p>
          {jamaah.is_initiator && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Anda
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          <p className="text-xs text-slate-500">Persiapan {progressPct}%</p>
        </div>
      </div>
    </div>
  );
}
