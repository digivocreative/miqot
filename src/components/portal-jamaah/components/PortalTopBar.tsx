import type { ReactNode } from 'react';
import type { PortalAgentInfo } from '../hooks/usePortalMe';

export default function PortalTopBar({
  rightSlot,
}: {
  agent?: PortalAgentInfo | null;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 shadow-sm shadow-slate-900/5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/70 dark:shadow-black/20">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-2">
        <img
          src="/logo-alhijaz.webp"
          alt="Alhijaz Indowisata"
          className="h-6 w-auto flex-none object-contain"
        />
        {rightSlot ? <div className="flex flex-none items-center gap-1.5">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
