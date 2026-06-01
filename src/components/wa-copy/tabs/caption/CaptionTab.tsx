import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChevronDown, Inbox, Package } from 'lucide-react';
import { useWaCopyContent } from '../../hooks/useWaCopyContent';
import { useAgentContext } from '../../hooks/useAgentContext';
import { useSelectedPackage } from '../../hooks/useSelectedPackage';
import { resolveCategoryIcon } from '../../lib/categoryIcons';
import type { CaptionCategory } from '../../lib/types';
import CategoryChips from './CategoryChips';
import CaptionCard from './CaptionCard';
import PackageSheet from './PackageSheet';

interface CaptionTabProps {
  showToast: (msg: string) => void;
}

export default function CaptionTab({ showToast }: CaptionTabProps) {
  const { captions, captionCategories } = useWaCopyContent();
  const agentCtx = useAgentContext();
  const pkg = useSelectedPackage();
  const [activeCategory, setActiveCategory] = useState<CaptionCategory>('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const categories = [...captionCategories].sort((a, b) => a.order - b.order);
  const resolvedCategory = categories.some(c => c.value === activeCategory)
    ? activeCategory
    : (categories[0]?.value ?? '');

  const activeMeta = categories.find(c => c.value === resolvedCategory) ?? categories[0];
  const labelOf = (value: string) => categories.find(c => c.value === value)?.label ?? value;
  const visible = captions
    .filter(c => c.active && c.category === resolvedCategory)
    .sort((a, b) => a.order - b.order);

  const firstNonEmpty = categories.find(c =>
    captions.some(cap => cap.active && cap.category === c.value),
  );

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      {/* Tempel Paket selector */}
      <button
        onClick={() => setSheetOpen(true)}
        className="w-full flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm p-3.5 active:scale-[0.99] transition-all"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 flex items-center justify-center flex-shrink-0">
            <Package size={16} className="text-amber-600 dark:text-amber-400" />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              Tempel Paket
            </span>
            <span className="block text-sm font-bold text-gray-800 dark:text-white truncate">
              {pkg.selected ? pkg.selected.nama : 'Pilih paket (opsional)'}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
      </button>

      {/* Category chips + micro-tip */}
      <CategoryChips
        options={categories.map(c => ({ value: c.value, label: c.label, icon: resolveCategoryIcon(c.iconName) }))}
        value={resolvedCategory}
        onChange={setActiveCategory}
      />
      <p className="rounded-xl border border-blue-100 dark:border-blue-800/30 bg-blue-50/70 dark:bg-blue-900/15 p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        {activeMeta?.tip}
      </p>

      {/* List / empty */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/60 py-12 px-6 text-center">
          <Inbox size={28} className="text-gray-400 dark:text-slate-500 opacity-40" />
          <p className="mt-3 text-sm font-bold text-gray-700 dark:text-slate-200">Belum ada caption</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            Kategori ini belum punya caption aktif.
          </p>
          {firstNonEmpty && firstNonEmpty.value !== resolvedCategory && (
            <button
              onClick={() => setActiveCategory(firstNonEmpty.value)}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold active:scale-95 transition"
            >
              Lihat Semua Kategori
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(entry => (
            <CaptionCard
              key={entry.id}
              entry={entry}
              categoryLabel={labelOf(entry.category)}
              agentCtx={agentCtx}
              pkgCtx={pkg.selectedCtx}
              showToast={showToast}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {sheetOpen && (
          <PackageSheet
            key="pkg-sheet"
            packages={pkg.packages}
            selectedId={pkg.selected?.jadwalId ?? null}
            loading={pkg.loading}
            onSelect={pkg.select}
            onClose={() => setSheetOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
