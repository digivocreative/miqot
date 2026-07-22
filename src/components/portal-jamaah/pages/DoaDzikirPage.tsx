import { useMemo, useState } from 'react';
import { ChevronDown, HandHeart, Search } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import { DOA_CATEGORIES, type DoaCategory } from '../lib/doaData';

const ICON_CLASS = 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/20 dark:text-fuchsia-400';

function matchesQuery(category: DoaCategory, q: string): DoaCategory | null {
  if (!q) return category;
  const entries = category.entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.terjemahan.toLowerCase().includes(q) ||
      e.latin.toLowerCase().includes(q)
  );
  return entries.length ? { ...category, entries } : null;
}

export default function DoaDzikirPage({ onBack }: { data?: unknown; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const isSearching = query.trim().length > 0;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DOA_CATEGORIES.map((c) => matchesQuery(c, q)).filter((c): c is DoaCategory => c !== null);
  }, [query]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-slate-900 dark:to-slate-950 dark:text-white">
      <PortalBackBar title="Doa & Dzikir" onBack={onBack} icon={HandHeart} iconClassName={ICON_CLASS} />
      <main className="mx-auto w-full max-w-lg space-y-3 px-4 pb-24 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" strokeWidth={2} />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari doa (judul atau terjemahan)"
            aria-label="Cari doa"
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm font-medium text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-fuchsia-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white px-5 py-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-bold text-gray-800 dark:text-slate-100">Doa tidak ditemukan</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">Coba kata kunci lain.</p>
          </div>
        ) : (
          groups.map((category) => {
            // Saat mencari, semua kategori yang cocok otomatis terbuka agar hasil terlihat.
            const open = isSearching || openIds.has(category.id);
            const panelId = `doa-panel-${category.id}`;
            return (
              <section
                key={category.id}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <h2>
                  <button
                    type="button"
                    onClick={() => toggle(category.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:hover:bg-slate-700/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-gray-900 dark:text-white">{category.title}</span>
                    </span>
                    <span className="flex-none rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 dark:bg-fuchsia-900/20 dark:text-fuchsia-300">
                      {category.entries.length} doa
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 flex-none text-gray-400 transition-transform duration-200 dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
                      strokeWidth={2.2}
                    />
                  </button>
                </h2>

                {open && (
                  <div id={panelId} className="space-y-2.5 border-t border-gray-100 px-3 pb-3 pt-3 dark:border-slate-700">
                    {category.entries.map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{entry.title}</h3>
                          {entry.sumber && (
                            <span className="flex-none rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-slate-700 dark:text-slate-300">
                              {entry.sumber}
                            </span>
                          )}
                        </div>
                        <p className="mt-3 font-arabic text-2xl leading-loose text-gray-900 dark:text-white" dir="rtl" lang="ar">
                          {entry.arab}
                        </p>
                        <p className="mt-3 text-sm italic leading-6 text-fuchsia-700 dark:text-fuchsia-300">{entry.latin}</p>
                        <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-slate-300">{entry.terjemahan}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
