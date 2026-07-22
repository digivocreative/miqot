import type { ReactNode } from 'react';
import { StatusChip, cn } from '../../ui';

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
            className={cn(
              'h-2.5 w-2.5 flex-none rounded-full',
              active ? 'bg-gold motion-safe:animate-pulse' : 'bg-ink/20',
            )}
          />
          <div className="min-w-0">
            <p className={cn('truncate text-sm font-bold', active ? 'text-burgundy-800' : 'text-ink/80')}>{label}</p>
            <p className="text-xs text-ink/60">{dateLabel}</p>
          </div>
        </div>
        <StatusChip status="neutral" className="flex-none">
          {done}/{total}
        </StatusChip>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
