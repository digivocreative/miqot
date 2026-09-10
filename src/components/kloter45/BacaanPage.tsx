import { useMemo, useState, type ComponentType } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import Kloter45SubPageShell from '@/components/kloter45/SubPageShell';
import type { DoaCategory } from '@/components/portal-jamaah/lib/doaData';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

function matchesQuery(category: DoaCategory, query: string): DoaCategory | null {
  if (!query) return category;
  const entries = category.entries.filter((entry) => (
    entry.title.toLowerCase().includes(query)
    || entry.terjemahan.toLowerCase().includes(query)
    || entry.latin.toLowerCase().includes(query)
  ));
  return entries.length ? { ...category, entries } : null;
}

// Halaman Doa dan Dzikir memakai kerangka yang sama; yang beda cuma judul,
// ikon, dan daftar kategorinya.
export default function Kloter45BacaanPage({
  pageId,
  title,
  icon,
  categories,
  onBack,
}: {
  pageId: 'doa' | 'dzikir';
  title: string;
  icon: IconComponent;
  categories: DoaCategory[];
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const isSearching = query.trim().length > 0;

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return categories
      .map((category) => matchesQuery(category, normalized))
      .filter((category): category is DoaCategory => category !== null);
  }, [categories, query]);

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

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Tidak ditemukan</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Coba kata kunci lain.</p>
          </div>
        ) : (
          groups.map((category) => {
            // Saat mencari, kategori yang cocok dibuka semua agar hasilnya terlihat.
            const open = isSearching || openIds.has(category.id);
            const panelId = `${pageId}-panel-${category.id}`;
            return (
              <section
                key={category.id}
                data-bacaan-category={category.id}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <h2>
                  <button
                    type="button"
                    onClick={() => toggle(category.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:hover:bg-slate-800/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 dark:text-slate-100">
                      {category.title}
                    </span>
                    <span className="flex-none rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                      {category.entries.length}
                    </span>
                    <ChevronDown
                      size={16}
                      strokeWidth={2.4}
                      className={`flex-none text-gray-400 transition-transform duration-200 dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                </h2>

                {open && (
                  <div id={panelId} className="space-y-2.5 border-t border-gray-100 px-3 pb-3 pt-3 dark:border-slate-800">
                    {category.entries.map((entry) => (
                      <article
                        key={entry.id}
                        data-bacaan-entry={entry.id}
                        className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">{entry.title}</h3>
                          {entry.sumber && (
                            <span className="flex-none rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-gray-500 dark:bg-slate-900 dark:text-slate-400">
                              {entry.sumber}
                            </span>
                          )}
                        </div>
                        <p className="mt-3 font-arabic text-2xl leading-loose text-gray-900 dark:text-slate-100" dir="rtl" lang="ar">
                          {entry.arab}
                        </p>
                        <p className="mt-3 text-sm italic leading-6 text-emerald-700 dark:text-emerald-300">{entry.latin}</p>
                        <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-slate-300">{entry.terjemahan}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </Kloter45SubPageShell>
  );
}
