import { ExternalLink, Eye, Share2 } from 'lucide-react';
import { buildBioLink, copyBioLink } from './useBioConfig';

interface Props {
  slug: string;
  agentName: string;
  onPreview: () => void;
  onNotice: (message: string, type: 'success' | 'error') => void;
}

export default function BottomBar({ slug, agentName, onPreview, onNotice }: Props) {
  const openPreview = () => {
    window.open(`/${slug}/bio`, '_blank', 'noopener,noreferrer');
  };

  const share = async () => {
    const url = buildBioLink(slug);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${agentName} — Bio`, url });
        onNotice('Link bio siap dibagikan', 'success');
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        // Share failed — fall through to clipboard.
      }
    }
    const ok = await copyBioLink(slug);
    onNotice(ok ? 'Link bio disalin' : 'Gagal menyalin link', ok ? 'success' : 'error');
  };

  return (
    <div className="sticky bottom-0 left-0 right-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-100 dark:border-slate-700 px-4 py-3">
      <div className="max-w-lg mx-auto flex gap-2">
        <button
          type="button"
          onClick={onPreview}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-sm font-semibold border border-gray-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
        >
          <Eye size={14} strokeWidth={2.5} />
          Preview
        </button>
        <button
          type="button"
          onClick={openPreview}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-md shadow-emerald-500/25 hover:bg-emerald-600 active:scale-95 transition-all"
        >
          <ExternalLink size={14} strokeWidth={2.5} />
          Lihat Bio
        </button>
        <button
          type="button"
          onClick={share}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-sm font-semibold border border-gray-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
        >
          <Share2 size={14} strokeWidth={2.5} />
          Share
        </button>
      </div>
    </div>
  );
}
