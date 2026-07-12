import { Check, Clock } from 'lucide-react';
import type { PortalJamaah } from '../hooks/usePortalMe';
import { toTitleCase } from '../utils/formatText';

type PaymentStatus = 'lunas' | 'dp' | 'belum';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'J';
}

function paymentStatusOf(j: PortalJamaah): PaymentStatus {
  const remaining = Number(j.sisa);
  const amountPaid = Number(j.bayar);
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) return 'belum';
  if (Number.isFinite(remaining) && remaining <= 0) return 'lunas';
  return 'dp';
}

const GENDER_RING: Record<string, string> = {
  L: 'ring-blue-300',
  P: 'ring-pink-300',
};

const OVERLAY_BG: Record<PaymentStatus, string> = {
  lunas: 'bg-emerald-500',
  dp: 'bg-blue-500',
  belum: 'bg-amber-500',
};

const PROGRESS_COLOR = (pct: number) =>
  pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';

const PROGRESS_TEXT = (pct: number) =>
  pct >= 80
    ? 'text-emerald-700 dark:text-emerald-400'
    : pct >= 50
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-rose-700 dark:text-rose-400';

export default function RosterItem({
  jamaah,
  progressPct,
}: {
  jamaah: PortalJamaah;
  progressPct: number;
}) {
  const status = paymentStatusOf(jamaah);
  const ring = GENDER_RING[jamaah.jk || ''] ?? 'ring-emerald-200';
  const safeProgress = Math.max(0, Math.min(100, Number(progressPct) || 0));
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="relative flex-none">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700 ring-2 dark:bg-emerald-900/30 dark:text-emerald-200 ${ring}`}>
          {initials(jamaah.nama)}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-slate-800 ${OVERLAY_BG[status]}`}>
          {status === 'lunas' && <Check size={9} strokeWidth={3} className="text-white" />}
          {status === 'dp' && <Clock size={9} strokeWidth={3} className="text-white" />}
          {status === 'belum' && <span className="text-[8px] font-bold text-white">?</span>}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-bold leading-5 text-gray-900 dark:text-white">{toTitleCase(jamaah.nama)}</p>
          {jamaah.is_initiator && (
            <span className="flex-none rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Anda
            </span>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-gray-500 dark:text-slate-400">Persiapan</span>
            <span className={PROGRESS_TEXT(safeProgress)}>{safeProgress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Persiapan ${toTitleCase(jamaah.nama)}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeProgress}
            className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700"
          >
            <div
              className={`h-full rounded-full transition-all ${PROGRESS_COLOR(safeProgress)}`}
              style={{ width: `${safeProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
