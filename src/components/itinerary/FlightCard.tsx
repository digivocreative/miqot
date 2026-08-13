import { Plane } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import { flightLegView } from '../../../lib/itinerary-pdf.js';

/** Satu leg hasil flightLegView — bentuk yang sama dipakai PDF "Rencana Perjalanan". */
interface Leg {
  kick: string;
  tglISO: string;
  dari: string;
  ke: string;
  /** Bandara transit; rute multi-leg "CGK-DXB / DXB-JED" menyisakan ['DXB']. */
  via: string[];
  /** Kosong bila jam jadwal ternyata kembar dengan jam tiba: `pulang_jam` di
   *  jadwal berisi jam TIBA di Jakarta, jadi angkanya pindah ke `jamTiba` dan
   *  sisi keberangkatan dirender "—" (jam berangkat tak ada di tabel jadwal). */
  jam: string;
  jamTiba: string | null;
  kode: string;
}

function LegRow({ leg }: { leg: Leg }) {
  const via = leg.via.length ? `via ${leg.via.join(', ')}` : null;
  const dateLabel = leg.tglISO
    ? new Date(leg.tglISO).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-itin-ink3">{leg.kick}</span>
        <span className="text-[11.5px] font-semibold text-itin-ink2">{dateLabel}</span>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div>
          <div className="text-[17px] font-extrabold leading-none tracking-[0.02em] text-itin-ink">{leg.dari}</div>
          <div className="mt-1 text-[11.5px] font-semibold tabular-nums text-[#8A0F0A]">{leg.jam || '—'}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="truncate text-[10.5px] font-bold tracking-[0.03em] text-itin-ink2">{leg.kode}</span>
          <div className="mt-1 flex w-full items-center gap-1.5">
            <span className="h-px flex-1 bg-[#EAE2D8]" />
            <Plane size={11} className="shrink-0 text-itin-ink3" />
            <span className="h-px flex-1 bg-[#EAE2D8]" />
          </div>
          {via && <span className="mt-1 max-w-full truncate text-[10.5px] text-itin-ink3">{via}</span>}
        </div>
        <div className="text-right">
          <div className="text-[17px] font-extrabold leading-none tracking-[0.02em] text-itin-ink">{leg.ke}</div>
          <div className="mt-1 text-[11.5px] font-semibold tabular-nums text-[#8A0F0A]">{leg.jamTiba || ' '}</div>
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
  // Rute, pemisah jam, dan aturan sembunyikan-jam-tiba dihitung di satu tempat
  // bersama PDF supaya kedua permukaan tak pernah menampilkan jam yang berbeda.
  const legs = flightLegView(paket, arrivals) as Leg[];
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
        {legs.map(leg => <LegRow key={leg.kick} leg={leg} />)}
      </div>
    </div>
  );
}
