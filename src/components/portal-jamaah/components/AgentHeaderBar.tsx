import type { PortalAgent } from '../lib/fetchAgentBySlug';

function initials(name?: string) {
  return (name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';
}

export default function AgentHeaderBar({ agent }: { agent: PortalAgent | null }) {
  return (
    <header className="border-b border-slate-100 bg-white">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {agent?.photo ? (
            <img
              src={agent.photo}
              alt={agent.name}
              className="h-10 w-10 flex-none rounded-full border border-slate-100 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">
              {initials(agent?.name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{agent?.name || 'Alhijaz Indowisata'}</p>
            <p className="text-[11px] font-medium text-slate-500">Portal Jamaah</p>
          </div>
        </div>
        <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
          Alhijaz
        </div>
      </div>
    </header>
  );
}
