import { ChevronLeft } from 'lucide-react';
import ProgressRing from './ProgressRing';

export type PersiapanSubTab = 'tahapan' | 'spiritual' | 'dokumen' | 'perlengkapan';

const SUB_TABS: Array<{ id: PersiapanSubTab; label: string }> = [
  { id: 'tahapan', label: 'Tahapan' },
  { id: 'spiritual', label: 'Spiritual' },
  { id: 'dokumen', label: 'Dokumen' },
  { id: 'perlengkapan', label: 'Perlengkapan' },
];

export default function PersiapanHeader({
  overallPct,
  activeSubTab,
  onSubTabChange,
  onBack,
}: {
  overallPct: number;
  activeSubTab: PersiapanSubTab;
  onSubTabChange: (tab: PersiapanSubTab) => void;
  onBack?: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-slate-100 bg-white">
      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-5 pb-3 pt-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-700"
          aria-label="Kembali ke sub-tab awal"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-slate-500">Tab</p>
          <p className="truncate text-[14px] font-bold text-slate-900">Persiapan</p>
        </div>
        <ProgressRing percentage={overallPct} size={44} />
      </div>
      <div className="mx-auto flex w-full max-w-md gap-1 overflow-x-auto px-5">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSubTabChange(tab.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[12px] transition-colors ${
              activeSubTab === tab.id
                ? 'border-emerald-700 font-bold text-emerald-700'
                : 'border-transparent font-semibold text-slate-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
