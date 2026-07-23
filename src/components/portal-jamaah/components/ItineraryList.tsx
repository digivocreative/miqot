import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { trackPublicEvent } from '@/utils/analytics';
import { Button, Card } from '../ui';

export interface ItineraryDay {
  dayNumber: string;
  title: string;
  date?: string | null;
  location?: string | null;
}

function compactDayLabel(dayNumber: string, index: number): string {
  const numericDay = dayNumber.match(/\d+/)?.[0];
  return `D${numericDay || index + 1}`;
}

export default function ItineraryList({ items, itineraryUrl, slug }: { items: ItineraryDay[]; itineraryUrl?: string | null; slug: string }) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = useMemo(() => (expanded ? items : items.slice(0, 3)), [expanded, items]);
  const hiddenCount = Math.max(0, items.length - 3);

  // The itinerary PDF is the portal's only jamaah-facing document; opening it = view_portal_doc.
  const handleOpenDoc = () => trackPublicEvent(slug, 'view_portal_doc');

  if (!items.length) {
    return (
      <Card className="overflow-hidden p-4 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-burgundy-200" strokeWidth={2} />
        <p className="mt-3 text-sm font-semibold text-ink">Itinerary belum tersedia</p>
        <p className="mt-1 text-xs leading-5 text-ink/60">Agent akan membagikan detail perjalanan saat jadwal final.</p>
        {itineraryUrl && (
          <Button href={itineraryUrl} target="_blank" rel="noreferrer" onClick={handleOpenDoc} variant="secondary" fullWidth className="mt-4">
            <ExternalLink className="h-4 w-4" strokeWidth={2} />
            Buka itinerary lengkap
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-4">
      <div className="space-y-3">
        {visibleItems.map((item, index) => (
          <div key={`${item.dayNumber}-${index}`} className="flex gap-3">
            <div
              title={item.dayNumber}
              className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-xl bg-burgundy-700/8 px-1 text-center font-mono text-xs font-bold tabular-nums text-burgundy-700"
            >
              {compactDayLabel(item.dayNumber, index)}
            </div>
            <div className="min-w-0 flex-1 border-b border-black/5 pb-3 last:border-0 last:pb-0">
              <p className="break-words text-sm font-semibold text-ink">{item.title}</p>
              <p className="mt-1 break-words text-xs leading-5 text-ink/60">
                {[item.date, item.location].filter(Boolean).join(' · ') || 'Detail menyusul'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <Button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          variant="secondary"
          fullWidth
          className="mt-4"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" strokeWidth={2} />
              Ringkas itinerary
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
              Lihat {hiddenCount} hari lainnya
            </>
          )}
        </Button>
      )}

      {itineraryUrl && (
        <Button href={itineraryUrl} target="_blank" rel="noreferrer" onClick={handleOpenDoc} variant="secondary" fullWidth className="mt-4">
          <ExternalLink className="h-4 w-4" strokeWidth={2} />
          Buka itinerary lengkap
        </Button>
      )}
    </Card>
  );
}
