import { Building2, MapPin } from 'lucide-react';
import { Card, IconTile } from '../ui';

export default function HotelCard({
  city,
  name,
  location,
  duration,
  roomType,
}: {
  city: string;
  name: string;
  location: string;
  duration: string;
  roomType?: string | null;
}) {
  const details = [duration, roomType].filter(Boolean).join(' · ');

  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-start gap-3">
        <IconTile tint="neutral">
          <Building2 className="h-5 w-5" strokeWidth={2} />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/50">{city}</p>
          <p className="mt-2 break-words text-sm font-bold leading-snug text-ink">{name}</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-ink/60">
            <MapPin className="h-3.5 w-3.5 flex-none text-burgundy-700" strokeWidth={2} />
            <span className="min-w-0 break-words">{location}</span>
          </div>
          {details && <p className="mt-3 break-words text-xs text-ink/60">{details}</p>}
        </div>
      </div>
    </Card>
  );
}
