import { useMemo, useState } from 'react';
import { ChevronDown, HandHeart, Search } from 'lucide-react';
import PortalBackBar from '../components/PortalBackBar';
import { Card, PortalPageShell, StatusChip, cn } from '../ui';
import { DOA_CATEGORIES, type DoaCategory } from '../lib/doaData';

// Back-bar icon pill — soft burgundy tint (fuchsia was off-brand; see redesign spec §8.9).
const ICON_CLASS = 'bg-burgundy-700/8 text-burgundy-700';

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
    <PortalPageShell>
      <PortalBackBar title="Doa & Dzikir" onBack={onBack} icon={HandHeart} iconClassName={ICON_CLASS} />
      <main className="mx-auto w-full max-w-lg space-y-3 px-4 pb-24 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={2} />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari doa (judul atau terjemahan)"
            aria-label="Cari doa"
            className="h-12 w-full rounded-lega border border-black/10 bg-white pl-10 pr-4 text-sm font-medium text-ink shadow-soft outline-none transition-colors placeholder:text-ink/40 focus:border-burgundy-700 focus:ring-2 focus:ring-burgundy-700 focus:ring-offset-2 focus:ring-offset-canvas"
          />
        </div>

        {groups.length === 0 ? (
          <Card className="px-5 py-6 text-center">
            <p className="text-sm font-bold text-ink">Doa tidak ditemukan</p>
            <p className="mt-1 text-xs leading-5 text-ink/50">Coba kata kunci lain.</p>
          </Card>
        ) : (
          groups.map((category) => {
            // Saat mencari, semua kategori yang cocok otomatis terbuka agar hasil terlihat.
            const open = isSearching || openIds.has(category.id);
            const panelId = `doa-panel-${category.id}`;
            return (
              <section
                key={category.id}
                className="overflow-hidden rounded-lega border border-black/5 bg-white shadow-soft"
              >
                <h2>
                  <button
                    type="button"
                    onClick={() => toggle(category.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-burgundy-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-burgundy-700"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm text-ink">{category.title}</span>
                    </span>
                    <StatusChip status="brand" className="flex-none">
                      {category.entries.length} doa
                    </StatusChip>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 flex-none text-ink/40 transition-transform duration-200',
                        open && 'rotate-180',
                      )}
                      strokeWidth={2.2}
                    />
                  </button>
                </h2>

                {open && (
                  <div id={panelId} className="space-y-2.5 border-t border-black/5 px-3 pb-3 pt-3">
                    {category.entries.map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-xl border border-black/5 bg-canvas p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-ink">{entry.title}</h3>
                          {entry.sumber && (
                            <StatusChip status="neutral" className="flex-none">
                              {entry.sumber}
                            </StatusChip>
                          )}
                        </div>
                        <p className="mt-3 font-arabic text-2xl leading-loose text-ink" dir="rtl" lang="ar">
                          {entry.arab}
                        </p>
                        <p className="mt-3 text-sm italic leading-6 text-burgundy-700">{entry.latin}</p>
                        <p className="mt-1.5 text-sm leading-6 text-ink/70">{entry.terjemahan}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>
    </PortalPageShell>
  );
}
