import { useMemo, useState, type ComponentType } from 'react';
import { ChevronDown, Search, Star } from 'lucide-react';
import Kloter45SubPageShell from '@/components/kloter45/SubPageShell';
import type { DoaEntry } from '@/components/portal-jamaah/lib/doaData';
import type { BacaanTab } from '@/lib/kloter45Bacaan';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

function matchesQuery(entry: DoaEntry, query: string) {
  return entry.title.toLowerCase().includes(query)
    || entry.terjemahan.toLowerCase().includes(query)
    || entry.latin.toLowerCase().includes(query);
}

// Halaman Doa dan Dzikir memakai kerangka yang sama: baris tab di atas, lalu
// satu daftar rata — tiap bacaan satu baris yang bisa dibuka. Yang beda cuma
// judul, ikon, dan tab-nya.
export default function Kloter45BacaanPage({
  pageId,
  title,
  icon,
  tabs,
  onBack,
}: {
  pageId: 'doa' | 'dzikir';
  title: string;
  icon: IconComponent;
  tabs: BacaanTab[];
  onBack: () => void;
}) {
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const isSearching = query.trim().length > 0;

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const entries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!activeTab) return [];
    return normalized ? activeTab.entries.filter((entry) => matchesQuery(entry, normalized)) : activeTab.entries;
  }, [activeTab, query]);

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Kloter45SubPageShell title={title} icon={icon} onBack={onBack}>
      <div data-bacaan-page={pageId} className="space-y-3">
        <div
          role="tablist"
          aria-label={`Kelompok ${title.toLowerCase()}`}
          data-bacaan-tabs
          className="grid gap-1 rounded-2xl border border-gray-100 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab?.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-bacaan-tab={tab.id}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setOpenIds(new Set());
                }}
                className={`min-h-10 rounded-xl px-2 py-2 text-xs font-bold transition-all active:scale-[0.98] ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <label className="flex h-10 items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 shadow-sm transition-all focus-within:ring-2 focus-within:ring-emerald-500/50 dark:border-slate-700 dark:bg-slate-800">
          <Search size={14} strokeWidth={2.4} className="flex-none text-gray-400 dark:text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Cari ${title.toLowerCase()} (judul atau terjemahan)`}
            aria-label={`Cari ${title.toLowerCase()}`}
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-gray-800 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-slate-500"
          />
        </label>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Tidak ditemukan</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Coba kata kunci lain.</p>
          </div>
        ) : (
          <section
            data-bacaan-list={activeTab?.id}
            className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
          >
            {entries.map((entry) => {
              // Saat mencari, hasil yang cocok dibuka semua agar langsung terbaca.
              const open = isSearching || openIds.has(entry.id);
              const panelId = `${pageId}-${activeTab?.id}-${entry.id}`;
              return (
                <article key={entry.id} data-bacaan-entry={entry.id}>
                  <h2>
                    <button
                      type="button"
                      onClick={() => toggle(entry.id)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:hover:bg-slate-800/60"
                    >
                      <Star size={16} strokeWidth={2} className="flex-none fill-amber-400 text-amber-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-sm font-bold text-gray-900 dark:text-slate-100">{entry.title}</span>
                      <ChevronDown
                        size={16}
                        strokeWidth={2.4}
                        className={`flex-none text-gray-400 transition-transform duration-200 dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </h2>

                  {open && (
                    <div id={panelId} className="border-t border-gray-100 bg-gray-50/60 px-4 pb-4 pt-3 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="font-arabic text-2xl leading-loose text-gray-900 dark:text-slate-100" dir="rtl" lang="ar">
                        {entry.arab}
                      </p>
                      <p className="mt-3 text-sm italic leading-6 text-emerald-700 dark:text-emerald-300">{entry.latin}</p>
                      <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-slate-300">{entry.terjemahan}</p>
                      {entry.sumber && (
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">{entry.sumber}</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </Kloter45SubPageShell>
  );
}
