import { Building2, MapPin } from 'lucide-react';

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
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-slate-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200">
          <Building2 className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{city}</p>
          <p className="mt-2 break-words text-sm font-bold leading-snug text-gray-900 dark:text-white">{name}</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
            <MapPin className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
            <span className="min-w-0 break-words">{location}</span>
          </div>
          {details && <p className="mt-3 break-words text-xs text-gray-500 dark:text-slate-400">{details}</p>}
        </div>
      </div>
    </section>
  );
}
