import { Check, Clock } from 'lucide-react';
import type { PortalJamaah } from '../hooks/usePortalMe';
import { formatRupiah, formatRupiahFull } from '../utils/formatRupiah';
import { toTitleCase } from '../utils/formatText';
import { Card, StatusChip, type ChipStatus } from '../ui';

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
  // Gender ring encodes jk (data) with brand tokens.
  const ring = jamaah.jk === 'P' ? 'ring-gold/60' : jamaah.jk === 'L' ? 'ring-burgundy-300' : 'ring-burgundy-200';
  const statusLabel = status === 'lunas' ? 'Lunas' : status === 'dp' ? 'Sudah DP' : 'Belum Bayar';
  // Functional payment semantics: lunas = success (green),
  // dp = warning (amber, partial), belum = danger (red). Burgundy is brand, never a status.
  const chipStatus: ChipStatus = status === 'lunas' ? 'success' : status === 'dp' ? 'warning' : 'danger';
  const dotColor = status === 'lunas' ? 'bg-emerald-500' : status === 'dp' ? 'bg-amber-500' : 'bg-red-500';
  const progressColor = status === 'lunas' ? 'bg-emerald-500' : status === 'dp' ? 'bg-amber-500' : 'bg-red-500';
  const remainingColor =
    status === 'lunas' ? 'text-emerald-600' : status === 'dp' ? 'text-amber-700' : 'text-red-600';

  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-none">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-burgundy-700/8 text-sm font-bold text-burgundy-800 ring-2 ${ring}`}>
            {initials(jamaah.nama)}
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${dotColor}`}
          >
            {status === 'lunas' && <Check size={9} strokeWidth={3} className="text-white" />}
            {status === 'dp' && <Clock size={9} strokeWidth={3} className="text-white" />}
            {status === 'belum' && <span className="text-[8px] font-bold text-white">?</span>}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{toTitleCase(jamaah.nama)}</p>
          <p className="mt-0.5 text-xs text-ink/50">Progress pembayaran jamaah</p>
        </div>
        <StatusChip status={chipStatus}>{statusLabel}</StatusChip>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-burgundy-50 px-3 py-2">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink/40">Sudah Bayar</p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-ink">{formatRupiah(amountPaid)}</p>
        </div>
        <div className="rounded-xl bg-burgundy-50 px-3 py-2">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink/40">
            {overpayment ? 'Lebih Bayar' : 'Sisa'}
          </p>
          <p className={`mt-1 font-mono text-sm font-bold tabular-nums ${remainingColor}`}>
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
        className="mt-4 h-2 overflow-hidden rounded-full bg-black/5"
      >
        <div
          className={`h-full rounded-full transition-all ${progressColor}`}
          style={{ width: `${lunas ? 100 : pct}%` }}
        />
      </div>
      {!lunas && (
        <p className="mt-3 rounded-xl bg-burgundy-50 px-3 py-2 text-xs text-ink/70">
          Sisa pembayaran:{' '}
          <span className="font-mono font-semibold tabular-nums text-ink">{formatRupiahFull(Math.max(0, remaining))}</span>
        </p>
      )}
    </Card>
  );
}
