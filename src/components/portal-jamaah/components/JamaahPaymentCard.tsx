import type { PortalJamaah } from '../hooks/usePortalMe';
import { formatRupiah, formatRupiahFull } from '../utils/formatRupiah';
import { toTitleCase } from '../utils/formatText';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'J';
}

export default function JamaahPaymentCard({ jamaah }: { jamaah: PortalJamaah }) {
  const lunas = Number(jamaah.sisa || 0) <= 0;
  const pct = Math.max(0, Math.min(100, Number(jamaah.bayar_pct || 0)));

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {initials(jamaah.nama)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{toTitleCase(jamaah.nama)}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Progress pembayaran jamaah</p>
        </div>
        <span
          className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            lunas ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}
        >
          {lunas ? 'Lunas' : `${pct}%`}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Sudah Bayar</p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{formatRupiah(jamaah.bayar)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Sisa</p>
          <p className={`mt-1 text-sm font-bold ${lunas ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {formatRupiah(jamaah.sisa)}
          </p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${lunas ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${lunas ? 100 : pct}%` }}
        />
      </div>
      {!lunas && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          Sisa pembayaran: <span className="font-semibold text-slate-900 dark:text-white">{formatRupiahFull(jamaah.sisa)}</span>
        </p>
      )}
    </div>
  );
}
