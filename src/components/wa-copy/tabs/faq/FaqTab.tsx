import { useState } from 'react';
import { Inbox, LayoutGrid, Search } from 'lucide-react';
import { useWaCopyContent } from '../../hooks/useWaCopyContent';
import { resolveCategoryIcon } from '../../lib/categoryIcons';
import type { FaqCategory } from '../../lib/types';
import CategoryChips from '../caption/CategoryChips';
import FaqAccordionItem from './FaqAccordionItem';

type FaqFilter = FaqCategory | 'all';

interface FaqTabProps {
  showToast: (msg: string) => void;
}

export default function FaqTab({ showToast }: FaqTabProps) {
  const { faqs, faqCategories } = useWaCopyContent();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FaqFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const categories = [...faqCategories].sort((a, b) => a.order - b.order);
  const catIndex = (c: FaqCategory) => categories.findIndex(x => x.value === c);
  const resolved: FaqFilter =
    activeCategory === 'all' || categories.some(c => c.value === activeCategory) ? activeCategory : 'all';

  const q = query.trim().toLowerCase();
  const visible = faqs
    .filter(f => f.active)
    .filter(f => resolved === 'all' || f.category === resolved)
    .filter(f => !q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q))
    .sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.order - b.order);

  const chipOptions = [
    { value: 'all' as FaqFilter, label: 'Semua', icon: LayoutGrid },
    ...categories.map(c => ({ value: c.value as FaqFilter, label: c.label, icon: resolveCategoryIcon(c.iconName) })),
  ];

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cari pertanyaan…"
          className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none text-gray-800 dark:text-white placeholder:text-gray-400"
        />
      </div>

      <CategoryChips options={chipOptions} value={resolved} onChange={setActiveCategory} />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/60 py-12 px-6 text-center">
          <Inbox size={28} className="text-gray-400 dark:text-slate-500 opacity-40" />
          <p className="mt-3 text-sm font-bold text-gray-700 dark:text-slate-200">Tidak ada pertanyaan</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Coba kata kunci atau kategori lain.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map(entry => (
            <FaqAccordionItem
              key={entry.id}
              entry={entry}
              open={openId === entry.id}
              onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
              showToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
