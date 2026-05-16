import type { ReactNode } from 'react';
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
  rightSlot,
}: {
  agent: PortalAgentInfo | null;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md dark:border-slate-700/50">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {agent?.photo ? (
            <img
              src={agent.photo}
              alt={agent.name}
              className="h-9 w-9 flex-none rounded-full border-2 border-emerald-200 object-cover shadow-sm dark:border-emerald-700"
            />
          ) : (
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-bold text-white shadow-sm">
              {initials(agent?.name)}
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] text-gray-500 dark:text-slate-400">Agent</p>
            <p className="truncate text-sm font-bold text-gray-800 dark:text-white">{agent?.name || 'Alhijaz'}</p>
          </div>
        </div>
        {rightSlot ? <div className="flex flex-none items-center gap-1.5">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
