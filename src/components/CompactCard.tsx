'use client';

import { useMemo } from 'react';
import { PlaneTakeoff, PlaneLanding } from 'lucide-react';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';

interface CompactCardProps {
  package: UmrohPackage;
  onToggle?: () => void;
  agent?: AgentData | null;
}

/**
 * CompactCard — Dense 2-column layout with all essential package info
 */
export function CompactCard({ package: pkg, onToggle, agent: _agent }: CompactCardProps) {
  // ---- Derived: cheapest tier ----
  const absoluteMinPrice = useMemo(() => {
    let minPrice = Infinity;
    for (const tierPricing of Object.values(pkg.harga)) {
      const prices = [tierPricing.Quard, tierPricing.Triple, tierPricing.Double];
      for (const priceStr of prices) {
        if (priceStr) {
          const val = parseInt(priceStr, 10);
          if (val > 0 && val < minPrice) minPrice = val;
        }
      }
    }
    return minPrice === Infinity ? null : minPrice;
  }, [pkg.harga]);

  const isFull = pkg.seatSisa <= 0;
  const takenSeats = pkg.seatTotal - pkg.seatSisa;

  // ---- Helpers ----
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const formatPriceJt = (price: number | null): string => {
    if (!price) return '-';
    const millions = price / 1000000;
    return parseFloat(millions.toFixed(1)).toString();
  };

  const fmtTime = (t: string) => t.replace('.', ':');

  return (
    <div
      data-jadwal-id={pkg.jadwalId}
      onClick={onToggle}
      className={`
        bg-white dark:bg-slate-800 rounded-xl overflow-hidden cursor-pointer
        shadow-sm border border-gray-100 dark:border-slate-700
        hover:shadow-md hover:border-gray-200 dark:hover:border-slate-600
        transition-all duration-200 active:scale-[0.995]
        ${isFull ? 'opacity-50' : ''}
      `}
    >
      <div className="px-3.5 py-3">
        {/* ---- Row 1: Departure Date (left) + Return Date (right) ---- */}
        <div className="flex items-baseline justify-between mb-0.5">
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
            {formatDate(pkg.keberangkatan.tgl)}
          </span>
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
            {formatDate(pkg.kepulangan.tgl)}
          </span>
        </div>

        {/* ---- Row 2: Package Name ---- */}
        <h3 className={`text-sm font-extrabold uppercase tracking-wide truncate mb-0.5 ${
          isFull
            ? 'line-through text-red-700 dark:text-red-500'
            : 'text-gray-900 dark:text-white'
        }`}>
          {pkg.nama}
        </h3>

        {/* ---- Row 3: Price ---- */}
        <p className="text-[13px] text-gray-600 dark:text-slate-300 mb-1.5">
          Mulai dari{' '}
          <span className="font-extrabold text-gray-900 dark:text-white">
            {formatPriceJt(absoluteMinPrice)} juta
          </span>
        </p>

        {/* ---- Row 4: Flight Details — 2 columns, fixed height ---- */}
        <div className="grid grid-cols-2 gap-x-4">
          {/* Left: Departure */}
          <div className="text-[12px] leading-[1.6]">
            <p className="text-gray-500 dark:text-slate-400">{pkg.keberangkatan.rute}</p>
            <p className="flex items-center gap-1 font-semibold text-gray-700 dark:text-slate-200">
              <PlaneTakeoff size={12} className="text-emerald-500 shrink-0" />
              {pkg.keberangkatan.kodePenerbangan}
            </p>
            <p className="text-gray-600 dark:text-slate-300">{fmtTime(pkg.keberangkatan.jam)} WIB</p>
          </div>

          {/* Right: Return */}
          <div className="text-[12px] text-right leading-[1.6]">
            <p className="text-gray-500 dark:text-slate-400">{pkg.kepulangan.rute}</p>
            <p className="flex items-center justify-end gap-1 font-semibold text-gray-700 dark:text-slate-200">
              <PlaneLanding size={12} className="text-emerald-500 shrink-0" />
              {pkg.kepulangan.kodePenerbangan}
            </p>
            <p className="flex items-center justify-end gap-1.5 text-gray-600 dark:text-slate-300">
              <span className={`
                font-bold text-xs tabular-nums shrink-0
                ${isFull
                  ? 'text-red-600 dark:text-red-400'
                  : pkg.seatSisa <= 10
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }
              `}>
                {takenSeats}/{pkg.seatTotal}
              </span>
              <span className="whitespace-nowrap">{fmtTime(pkg.kepulangan.jam)} WIB</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompactCard;
