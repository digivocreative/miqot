import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import Toggle from './Toggle';

export interface ContentRow {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
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

export default function ContentList({ rows, onToggle, onReorder, onEdit }: ContentListProps) {
  if (rows.length === 0) {
    return <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-10">Belum ada konten.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div
          key={row.id}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 flex items-start gap-2"
        >
          <div className="flex flex-col gap-0.5 pt-0.5">
            <button
              onClick={() => onReorder(row.id, 'up')}
              disabled={!row.canUp}
              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
              aria-label="Naik"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => onReorder(row.id, 'down')}
              disabled={!row.canDown}
              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
              aria-label="Turun"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          <button onClick={() => onEdit(row.id)} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                {row.badge}
              </span>
              {!row.active && (
                <span className="text-[9px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 px-2 py-0.5 rounded-full">
                  Nonaktif
                </span>
              )}
            </div>
            <p className={`mt-1 text-sm font-bold truncate ${row.active ? 'text-gray-800 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
              {row.title}
            </p>
            {row.subtitle && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{row.subtitle}</p>}
          </button>

          <div className="flex items-center gap-1.5 pt-0.5">
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
    </div>
  );
}
