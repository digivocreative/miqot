import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Search, SearchX } from 'lucide-react';
import Toggle from './Toggle';

export interface ContentRow {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  /** Full text behind the (truncated) title — what search matches against. */
  searchText: string;
  active: boolean;
  canUp: boolean;
  canDown: boolean;
}

interface ContentListProps {
  rows: ContentRow[];
  onToggle: (id: string) => void;
  onReorder: (id: string, dir: 'up' | 'down') => void;
  onEdit: (id: string) => void;
}

interface ContentGroup {
  badge: string;
  rows: ContentRow[];
}

export default function ContentList({ rows, onToggle, onReorder, onEdit }: ContentListProps) {
  // Search lives here (not in WaCopyAdminPage, which stays view-state-free).
  // The parent keys this component by tab, so the query resets on tab switch.
  const [query, setQuery] = useState('');

  if (rows.length === 0) {
    return <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-10">Belum ada konten.</p>;
  }

  const q = query.trim().toLowerCase();
  // Reordering swaps with list neighbors that may be filtered out — disable while searching.
  const filtering = q.length > 0;
  const visible = filtering
    ? rows.filter(r => `${r.badge}\n${r.title}\n${r.subtitle}\n${r.searchText}`.toLowerCase().includes(q))
    : rows;

  const groups = visible.reduce<ContentGroup[]>((acc, row) => {
    const current = acc[acc.length - 1];
    if (current?.badge === row.badge) {
      current.rows.push(row);
      return acc;
    }
    acc.push({ badge: row.badge, rows: [row] });
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cari konten…"
          className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none text-gray-800 dark:text-white placeholder:text-gray-400"
        />
      </div>

      {visible.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/60 py-12 px-6 text-center">
          <SearchX size={28} className="text-gray-400 dark:text-slate-500 opacity-40" />
          <p className="mt-3 text-sm font-bold text-gray-700 dark:text-slate-200">Tidak ada hasil</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Coba kata kunci lain.</p>
        </div>
      )}

      {groups.map(group => (
        <section key={group.badge} className="space-y-2">
          <h2 className="px-1 text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            {group.badge}
          </h2>
          {group.rows.map(row => (
            <div
              key={row.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 flex items-center gap-3"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => onReorder(row.id, 'up')}
                  disabled={!row.canUp || filtering}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 dark:text-slate-600 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-slate-700 dark:hover:text-slate-400 disabled:opacity-20 transition-colors"
                  aria-label="Naik"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => onReorder(row.id, 'down')}
                  disabled={!row.canDown || filtering}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 dark:text-slate-600 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-slate-700 dark:hover:text-slate-400 disabled:opacity-20 transition-colors"
                  aria-label="Turun"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <button onClick={() => onEdit(row.id)} className="flex-1 min-w-0 text-left">
                <p className={`text-sm font-bold leading-5 line-clamp-2 ${row.active ? 'text-gray-800 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                  {row.title}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {row.subtitle && <p className="min-w-0 truncate text-xs text-gray-400 dark:text-slate-500">{row.subtitle}</p>}
                  {!row.active && (
                    <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 px-2 py-0.5 rounded-full">
                      Nonaktif
                    </span>
                  )}
                </div>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onEdit(row.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Edit"
                >
                  <Pencil size={14} />
                </button>
                <Toggle checked={row.active} onChange={() => onToggle(row.id)} aria-label="Aktif" />
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
