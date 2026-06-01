import type { LadderEntry } from '@/lib/hajiPlusPricing';

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

interface PriceLadderProps {
  ladder: LadderEntry[];
  accent: 'emerald' | 'blue';
}

export default function PriceLadder({ ladder, accent }: PriceLadderProps) {
  const rows = ladder.length;
  const barColor = accent === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500';
  const departureText = accent === 'emerald'
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-blue-700 dark:text-blue-400';

  if (!ladder.length) return null;

  return (
    <div className="space-y-1.5">
      {ladder.map((e, i) => {
        const width = 45 + (rows > 1 ? (i / (rows - 1)) * 55 : 55);
        return (
          <div key={e.year} className="flex items-center gap-2">
            <span className={`text-[10px] w-8 ${e.isDeparture ? `font-bold ${departureText}` : 'text-gray-500 dark:text-slate-400'}`}>
              {e.year}
            </span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full ${e.isDeparture ? barColor : 'bg-gray-300 dark:bg-slate-600'}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className={`text-[11px] tabular-nums ${e.isDeparture ? `font-bold ${departureText}` : 'text-gray-700 dark:text-white'}`}>
              {fmtUSD(e.priceUSD)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
