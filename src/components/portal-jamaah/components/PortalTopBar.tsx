import type { ReactNode } from 'react';
import type { PortalAgentInfo } from '../hooks/usePortalMe';

export default function PortalTopBar({
  agent,
  rightSlot,
}: {
  agent?: PortalAgentInfo | null;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 shadow-sm shadow-slate-900/5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/70 dark:shadow-black/20">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/logo-alhijaz.webp"
            alt="Alhijaz Indowisata"
            className="h-6 w-auto flex-none object-contain"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Portal Jamaah</p>
            <p className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">{agent?.name || 'Alhijaz Indowisata'}</p>
          </div>
        </div>
        {rightSlot ? <div className="flex flex-none items-center gap-1.5">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
