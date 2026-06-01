import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { useWaCopyContent } from '../../hooks/useWaCopyContent';
import { TOUR_PHASES } from '../../lib/tourleader';
import type { TourPhase } from '../../lib/types';
import CategoryChips from '../caption/CategoryChips';
import TourStepCard from './TourStepCard';

interface TourLeaderTabProps {
  showToast: (msg: string) => void;
}

export default function TourLeaderTab({ showToast }: TourLeaderTabProps) {
  const { tourSteps } = useWaCopyContent();
  const [activePhase, setActivePhase] = useState<TourPhase>('sebelum');

  const meta = TOUR_PHASES.find(p => p.value === activePhase) ?? TOUR_PHASES[0];
  const visible = tourSteps
    .filter(t => t.active && t.phase === activePhase)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <CategoryChips
        options={TOUR_PHASES.map(p => ({ value: p.value, label: p.label, icon: p.icon }))}
        value={activePhase}
        onChange={setActivePhase}
      />
      <p className="rounded-xl border border-blue-100 dark:border-blue-800/30 bg-blue-50/70 dark:bg-blue-900/15 p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        {meta.tip}
      </p>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/60 py-12 px-6 text-center">
          <Inbox size={28} className="text-gray-400 dark:text-slate-500 opacity-40" />
          <p className="mt-3 text-sm font-bold text-gray-700 dark:text-slate-200">Belum ada langkah</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Fase ini belum punya panduan aktif.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((entry, i) => (
            <TourStepCard key={entry.id} entry={entry} index={i + 1} showToast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}
