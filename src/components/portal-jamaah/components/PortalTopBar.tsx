import type { ReactNode } from 'react';
import { Bell, ChevronLeft } from 'lucide-react';
import type { PortalAgentInfo } from '../hooks/usePortalMe';

function initials(name?: string | null) {
  return (name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';
}

export default function PortalTopBar({
  agent,
  showBack = false,
  title,
  onBack,
  rightSlot,
}: {
  agent: PortalAgentInfo | null;
  showBack?: boolean;
  title?: string;
  onBack?: () => void;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white px-5 py-3">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-700"
            aria-label="Kembali"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            {agent?.photo ? (
              <img
                src={agent.photo}
                alt={agent.name}
                className="h-8 w-8 flex-none rounded-full border border-slate-100 object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                {initials(agent?.name)}
              </div>
            )}
            <div className="min-w-0 leading-tight">
              <p className="text-[10px] text-slate-500">Agent</p>
              <p className="truncate text-[12px] font-semibold text-slate-900">{agent?.name || 'Alhijaz'}</p>
            </div>
          </div>
        )}

        {title && (
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] text-slate-500">Tab</p>
            <p className="truncate text-[14px] font-bold text-slate-900">{title}</p>
          </div>
        )}

        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700"
            aria-label="Notifikasi"
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
          </button>
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
