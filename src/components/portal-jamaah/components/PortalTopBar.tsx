import type { ReactNode } from 'react';
import type { PortalAgentInfo } from '../hooks/usePortalMe';

export default function PortalTopBar({
  rightSlot,
}: {
  agent?: PortalAgentInfo | null;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md dark:border-slate-700/50">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <img
          src="/logo-alhijaz.webp"
          alt="Alhijaz Indowisata"
          className="h-8 w-auto flex-none object-contain"
        />
        {rightSlot ? <div className="flex flex-none items-center gap-1.5">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
