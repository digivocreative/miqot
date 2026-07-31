import { Plane } from 'lucide-react';
import type { UmrohPackage } from '@/types';

function LegRow({ kick, tgl, jam, jamTiba, rute, kode }: {
  kick: string; tgl: string; jam: string; jamTiba?: string | null; rute: string; kode: string;
}) {
  const stops = rute.split(/[/,]|\s-\s|–/).map(s => s.trim()).filter(Boolean);
  // Rute multi-leg "CGK-DXB / DXB-JED" menghasilkan duplikat kota transit — buang beruntun.
  const uniq = stops.flatMap(s => s.split('-').map(x => x.trim())).filter((s, i, a) => s && s !== a[i - 1]);
  const from = uniq[0] || '—';
  const to = uniq[uniq.length - 1] || '—';
  const via = uniq.length > 2 ? `via ${uniq.slice(1, -1).join(', ')}` : null;
  const dateLabel = tgl
    ? new Date(tgl).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-itin-ink3">{kick}</span>
        <span className="text-[11.5px] font-semibold text-itin-ink2">{dateLabel}</span>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div>
          <div className="text-[17px] font-extrabold leading-none tracking-[0.02em] text-itin-ink">{from}</div>
          <div className="mt-1 text-[11.5px] font-semibold tabular-nums text-[#8A0F0A]">{jam || '—'}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="truncate text-[10.5px] font-bold tracking-[0.03em] text-itin-ink2">{kode}</span>
          <div className="mt-1 flex w-full items-center gap-1.5">
            <span className="h-px flex-1 bg-[#EAE2D8]" />
            <Plane size={11} className="shrink-0 text-itin-ink3" />
            <span className="h-px flex-1 bg-[#EAE2D8]" />
          </div>
          {via && <span className="mt-1 max-w-full truncate text-[10.5px] text-itin-ink3">{via}</span>}
        </div>
        <div className="text-right">
          <div className="text-[17px] font-extrabold leading-none tracking-[0.02em] text-itin-ink">{to}</div>
          <div className="mt-1 text-[11.5px] font-semibold tabular-nums text-[#8A0F0A]">{jamTiba || ' '}</div>
        </div>
      </div>
    </div>
  );
}

export default function FlightCard({ paket, arrivals }: {
  paket: UmrohPackage;
  arrivals?: { berangkat: string | null; pulang: string | null };
}) {
  if (!paket.keberangkatan?.rute && !paket.kepulangan?.rute) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#EAE2D8] bg-white">
      <div className="flex items-center justify-between border-b border-[#F1EAE1] px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[13.5px] font-bold text-itin-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold-50 text-[#8A0F0A]">
            <Plane size={14} />
          </span>
          Penerbangan
        </span>
        {paket.maskapai && (
          <span className="rounded-md bg-itin-canvas px-2 py-0.5 text-[10px] font-bold capitalize tracking-[0.03em] text-itin-ink2">
            {paket.maskapai.toLowerCase()}
          </span>
        )}
      </div>
      <div className="space-y-3.5 p-3.5">
        <LegRow
          kick="Berangkat"
          tgl={paket.keberangkatan?.tgl || ''}
          jam={paket.keberangkatan?.jam || ''}
          jamTiba={arrivals?.berangkat}
          rute={paket.keberangkatan?.rute || ''}
          kode={paket.keberangkatan?.kodePenerbangan || ''}
        />
        <LegRow
          kick="Pulang"
          tgl={paket.kepulangan?.tgl || ''}
          jam={paket.kepulangan?.jam || ''}
          jamTiba={arrivals?.pulang}
          rute={paket.kepulangan?.rute || ''}
          kode={paket.kepulangan?.kodePenerbangan || ''}
        />
      </div>
    </div>
  );
}
