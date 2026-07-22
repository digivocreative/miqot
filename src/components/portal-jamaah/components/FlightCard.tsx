import { Plane } from 'lucide-react';
import { Card, IconTile } from '../ui';

export default function FlightCard({
  label,
  route,
  code,
  time,
  airline,
  note,
}: {
  label: string;
  route: string;
  code: string;
  time: string;
  airline: string;
  note: string;
}) {
  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-start gap-3">
        <IconTile tint="neutral">
          <Plane className="h-5 w-5" strokeWidth={2} />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/50">
              {label}
            </p>
            <span
              title={code}
              className="max-w-[55%] flex-none truncate rounded-md bg-burgundy-700/8 px-2 py-1 font-mono text-xs font-bold tabular-nums text-burgundy-800"
            >
              {code}
            </span>
          </div>
          <p className="mt-2 break-words text-sm font-bold leading-snug text-ink">{route}</p>
          <p className="mt-1 font-mono text-sm tabular-nums text-ink/60">{time}</p>
          <p className="mt-3 break-words text-xs leading-5 text-ink/60">
            {airline} · {note}
          </p>
        </div>
      </div>
    </Card>
  );
}
