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
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/70 shadow-soft backdrop-blur-xl backdrop-saturate-150">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-gold opacity-30" />
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/logo-alhijaz.webp"
            alt="Alhijaz Indowisata"
            className="h-6 w-auto flex-none object-contain"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">Portal Jamaah</p>
            <p className="truncate text-[10px] font-medium text-ink/60">{agent?.name || 'Alhijaz Indowisata'}</p>
          </div>
        </div>
        {rightSlot ? <div className="flex flex-none items-center gap-1.5">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
