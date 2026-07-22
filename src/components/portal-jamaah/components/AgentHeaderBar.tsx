import type { ReactNode } from 'react';
import type { PortalAgent } from '../lib/fetchAgentBySlug';
import { Avatar, StatusChip } from '../ui';

export default function AgentHeaderBar({ agent, rightSlot }: { agent: PortalAgent | null; rightSlot?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 shadow-soft backdrop-blur-xl backdrop-saturate-150">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-gold opacity-30" />
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {agent?.photo ? (
            <img
              src={agent.photo}
              alt={agent.name}
              className="h-10 w-10 flex-none rounded-full border border-black/5 object-cover"
            />
          ) : (
            <Avatar name={agent?.name || 'Alhijaz Indowisata'} size="md" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{agent?.name || 'Alhijaz Indowisata'}</p>
            <p className="text-[11px] font-medium text-ink/60">Portal Jamaah</p>
          </div>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <StatusChip status="brand">Alhijaz</StatusChip>
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
