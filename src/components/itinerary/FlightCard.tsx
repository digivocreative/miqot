import { Plane } from 'lucide-react';
import type { UmrohPackage } from '@/types';

function LegRow({ kick, tgl, jam, rute, kode }: { kick: string; tgl: string; jam: string; rute: string; kode: string }) {
  const stops = rute.split(/[/,]|\s-\s|–/).map(s => s.trim()).filter(Boolean);
  // Rute multi-leg "CGK-DXB / DXB-JED" menghasilkan duplikat kota transit — buang beruntun.
  const uniq = stops.flatMap(s => s.split('-').map(x => x.trim())).filter((s, i, a) => s && s !== a[i - 1]);
  const from = uniq[0] || '—';
  const to = uniq[uniq.length - 1] || '—';
  const via = uniq.length > 2 ? `via ${uniq.slice(1, -1).join(', ')}` : null;
  const dateLabel = tgl
    ? new Date(tgl).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.07em] text-itin-ink3">{kick}</span>
        <span className="text-[10.5px] font-semibold text-itin-ink2">{dateLabel}</span>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div>
          <div className="font-mono text-[16px] font-bold leading-none text-itin-ink">{from}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-itin-ink3">{jam || '—'}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="truncate font-mono text-[9.5px] font-medium text-itin-ink2">{kode}</span>
          <div className="mt-1 flex w-full items-center gap-1.5">
            <span className="h-px flex-1 bg-itin-line" />
            <Plane size={11} className="shrink-0 text-itin-ink3" />
            <span className="h-px flex-1 bg-itin-line" />
          </div>
          {via && <span className="mt-1 max-w-full truncate text-[9.5px] text-itin-ink3">{via}</span>}
        </div>
        <div className="text-right">
          <div className="font-mono text-[16px] font-bold leading-none text-itin-ink">{to}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-itin-ink3">&nbsp;</div>
        </div>
      </div>
    </div>
  );
}

export default function FlightCard({ paket }: { paket: UmrohPackage }) {
  if (!paket.keberangkatan?.rute && !paket.kepulangan?.rute) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-itin-line bg-white">
      <div className="flex items-center justify-between border-b border-itin-line px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-itin-ink">
          <Plane size={14} className="text-itin-ink2" /> Penerbangan
        </span>
        {paket.maskapai && (
          <span className="rounded-md bg-itin-canvas px-2 py-0.5 text-[9.5px] font-bold tracking-[0.03em] text-itin-ink2">
            {paket.maskapai}
          </span>
        )}
      </div>
      <div className="space-y-4 p-3.5">
        <LegRow
          kick="Berangkat"
          tgl={paket.keberangkatan?.tgl || ''}
          jam={paket.keberangkatan?.jam || ''}
          rute={paket.keberangkatan?.rute || ''}
          kode={paket.keberangkatan?.kodePenerbangan || ''}
        />
        <LegRow
          kick="Pulang"
          tgl={paket.kepulangan?.tgl || ''}
          jam={paket.kepulangan?.jam || ''}
          rute={paket.kepulangan?.rute || ''}
          kode={paket.kepulangan?.kodePenerbangan || ''}
        />
      </div>
    </div>
  );
}
