import { Check, Clock } from 'lucide-react';
import type { PortalJamaah } from '../hooks/usePortalMe';
import { toTitleCase } from '../utils/formatText';
import { Card, StatusChip, cn } from '../ui';

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

// Gender hint re-toned to brand tokens (burgundy / gold) — decorative ring only.
const GENDER_RING: Record<string, string> = {
  L: 'ring-burgundy-300',
  P: 'ring-gold/60',
};

// Payment status overlay — functional semantics, distinct from the burgundy brand:
// lunas = success (green), dp = warning (amber, partial), belum = danger (red).
const OVERLAY_BG: Record<PaymentStatus, string> = {
  lunas: 'bg-emerald-500',
  dp: 'bg-amber-500',
  belum: 'bg-red-500',
};

const PROGRESS_COLOR = (pct: number) =>
  pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';

const PROGRESS_TEXT = (pct: number) =>
  pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-600';

export default function RosterItem({
  jamaah,
  progressPct,
}: {
  jamaah: PortalJamaah;
  progressPct: number;
}) {
  const status = paymentStatusOf(jamaah);
  const ring = GENDER_RING[jamaah.jk || ''] ?? 'ring-burgundy-200';
  const safeProgress = Math.max(0, Math.min(100, Number(progressPct) || 0));
  return (
    <Card className="flex items-center gap-3 p-3.5">
      <div className="relative flex-none">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-gradient-burgundy text-sm font-bold text-white ring-2', ring)}>
          {initials(jamaah.nama)}
        </div>
        <div className={cn('absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white', OVERLAY_BG[status])}>
          {status === 'lunas' && <Check size={9} strokeWidth={3} className="text-white" />}
          {status === 'dp' && <Clock size={9} strokeWidth={3} className="text-white" />}
          {status === 'belum' && <span className="text-[8px] font-bold text-white">?</span>}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-bold leading-5 text-ink">{toTitleCase(jamaah.nama)}</p>
          {jamaah.is_initiator && <StatusChip status="brand">Anda</StatusChip>}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-ink/60">Persiapan</span>
            <span className={cn('font-mono tabular-nums', PROGRESS_TEXT(safeProgress))}>{safeProgress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Persiapan ${toTitleCase(jamaah.nama)}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeProgress}
            className="h-1.5 overflow-hidden rounded-full bg-black/5"
          >
            <div
              className={cn('h-full rounded-full transition-all', PROGRESS_COLOR(safeProgress))}
              style={{ width: `${safeProgress}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
