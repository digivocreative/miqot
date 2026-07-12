import type { ReactNode } from 'react';
import type { PortalAgent } from '../lib/fetchAgentBySlug';

function initials(name?: string) {
  return (name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';
}

export default function AgentHeaderBar({ agent, rightSlot }: { agent: PortalAgent | null; rightSlot?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 shadow-sm shadow-slate-900/5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/70 dark:shadow-black/20">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {agent?.photo ? (
            <img
              src={agent.photo}
              alt={agent.name}
              className="h-10 w-10 flex-none rounded-full border border-gray-100 object-cover dark:border-slate-700"
            />
          ) : (
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {initials(agent?.name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{agent?.name || 'Alhijaz Indowisata'}</p>
            <p className="text-[11px] font-medium text-gray-500 dark:text-slate-400">Portal Jamaah</p>
          </div>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-300">
            Alhijaz
          </div>
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
