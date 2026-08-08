import type { ReactNode } from 'react';
import { cn } from './cn';

export type ChipStatus = 'success' | 'warning' | 'danger' | 'neutral' | 'brand' | 'info';

/**
 * The ONE soft-chip system for the portal. Backs AlertTone / TaskCategory /
 * document STATUS_BADGE / Perlengkapan / payment status maps.
 * Semantic colors are functional and kept distinct from the burgundy brand:
 * success = green, danger = red, warning = amber. `brand` = soft burgundy,
 * `info` = gold. Never use `brand` to mean "success".
 */
const STYLES: Record<ChipStatus, string> = {
  success: 'bg-emerald-500/12 text-emerald-700',
  warning: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/12 text-red-600',
  neutral: 'bg-slate-500/10 text-slate-600',
  brand: 'bg-burgundy-700/8 text-burgundy-800',
  info: 'bg-gold-500/15 text-gold-700',
};

export default function StatusChip({
  status = 'neutral',
  children,
  className,
}: {
  status?: ChipStatus;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.05em]',
        STYLES[status],
        className,
      )}
    >
      {children}
    </span>
  );
}
