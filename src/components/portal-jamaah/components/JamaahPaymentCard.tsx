import { Check, Clock } from 'lucide-react';
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
  const rawAmountPaid = Number(jamaah.bayar);
  const rawRemaining = Number(jamaah.sisa);
  const rawPct = Number(jamaah.bayar_pct);
  const amountPaid = Number.isFinite(rawAmountPaid) ? rawAmountPaid : 0;
  const remaining = Number.isFinite(rawRemaining) ? rawRemaining : 0;
  const status = Number.isFinite(rawRemaining) && rawRemaining <= 0 ? 'lunas' : amountPaid > 0 ? 'dp' : 'belum';
  const lunas = status === 'lunas';
  const overpayment = remaining < 0;
  const pct = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, rawPct)) : 0;
  const ring = jamaah.jk === 'P' ? 'ring-pink-300' : jamaah.jk === 'L' ? 'ring-blue-300' : 'ring-emerald-200';
  const statusLabel = status === 'lunas' ? 'Lunas' : status === 'dp' ? 'Sudah DP' : 'Belum Bayar';
  const statusClasses =
    status === 'lunas'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : status === 'dp'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  const progressColor = status === 'lunas' ? 'bg-emerald-500' : status === 'dp' ? 'bg-blue-500' : 'bg-amber-500';
  const remainingColor =
    status === 'lunas'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'dp'
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-3">
        <div className="relative flex-none">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700 ring-2 dark:bg-slate-700 dark:text-slate-200 ${ring}`}>
            {initials(jamaah.nama)}
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-slate-800 ${
              status === 'lunas' ? 'bg-emerald-500' : status === 'dp' ? 'bg-blue-500' : 'bg-amber-500'
            }`}
          >
            {status === 'lunas' && <Check size={9} strokeWidth={3} className="text-white" />}
            {status === 'dp' && <Clock size={9} strokeWidth={3} className="text-white" />}
            {status === 'belum' && <span className="text-[8px] font-bold text-white">?</span>}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{toTitleCase(jamaah.nama)}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Progress pembayaran jamaah</p>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses}`}>
          {statusLabel}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Sudah Bayar</p>
          <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{formatRupiah(amountPaid)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            {overpayment ? 'Lebih Bayar' : 'Sisa'}
          </p>
          <p className={`mt-1 text-sm font-bold ${remainingColor}`}>
            {formatRupiah(overpayment ? Math.abs(remaining) : Math.max(0, remaining))}
          </p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={`Progress pembayaran ${toTitleCase(jamaah.nama)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={lunas ? 100 : pct}
        className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700"
      >
        <div
          className={`h-full rounded-full transition-all ${progressColor}`}
          style={{ width: `${lunas ? 100 : pct}%` }}
        />
      </div>
      {!lunas && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          Sisa pembayaran:{' '}
          <span className="font-semibold text-slate-900 dark:text-white">{formatRupiahFull(Math.max(0, remaining))}</span>
        </p>
      )}
    </div>
  );
}
