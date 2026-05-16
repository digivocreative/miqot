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
  roomType: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Building2 className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{city}</p>
          <p className="mt-2 text-base font-bold text-slate-950">{name}</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
            <span>{location}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {duration} · {roomType}
          </p>
        </div>
      </div>
    </section>
  );
}
