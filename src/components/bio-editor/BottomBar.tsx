import { ExternalLink, Eye } from 'lucide-react';

interface Props {
  slug: string;
  onPreview: () => void;
}

export default function BottomBar({ slug, onPreview }: Props) {
  const openPreview = () => {
    window.open(`/${slug}/bio`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-100 dark:border-slate-700 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="max-w-lg mx-auto grid grid-cols-[0.92fr_1.08fr] gap-2.5">
        <button
          type="button"
          onClick={onPreview}
          className="min-w-0 flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 text-sm font-bold border border-emerald-200 dark:border-emerald-800/50 shadow-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-95 transition-all"
        >
          <Eye size={16} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate">Preview</span>
        </button>
        <button
          type="button"
          onClick={openPreview}
          className="min-w-0 flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 transition-all"
        >
          <ExternalLink size={16} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate">Lihat Bio</span>
        </button>
      </div>
    </div>
  );
}
