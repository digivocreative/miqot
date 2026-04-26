import { Search, ChevronRight, Check } from 'lucide-react';
import type { BioSeoConfig } from '../bio/types';

interface Props {
  seo: BioSeoConfig;
  onTap: () => void;
}

/**
 * Standalone "Atur SEO" entry point — opens SheetSeo on tap.
 * Shows whether the agent has customized title/description/OG image
 * so the card is informative whether they've touched it or not.
 */
export default function SeoCard({ seo, onTap }: Props) {
  const hasTitle = !!seo.title?.trim();
  const hasDesc = !!seo.description?.trim();
  const hasImage = !!seo.og_image_url?.trim();
  const filled = [hasTitle, hasDesc, hasImage].filter(Boolean).length;
  const customized = filled > 0;

  const subtitle = customized
    ? `${filled}/3 field dikustomisasi · tap untuk edit`
    : 'Title, deskripsi & gambar pratinjau saat link dibagikan';

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full text-left bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
          <Search size={15} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.3} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-gray-800 dark:text-white">Atur SEO</p>
            {customized && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                <Check size={9} strokeWidth={3} /> KUSTOM
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">
            {subtitle}
          </p>
        </div>
        <ChevronRight size={16} className="text-gray-400 dark:text-slate-500 shrink-0" />
      </div>
    </button>
  );
}
