import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  slug: string;
}

export default function SheetPreview({ open, onClose, slug }: Props) {
  const url = `/${slug}/bio`;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9000] bg-gray-50 dark:bg-slate-950 flex flex-col">
      <div className="shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-gray-100 dark:border-slate-700 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
              Preview
            </p>
            <h2 className="text-sm font-bold text-gray-800 dark:text-white">Bio Publik</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
            aria-label="Tutup preview"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-[390px]">
          <div className="rounded-[2rem] border-[10px] border-gray-900 dark:border-slate-900 bg-gray-900 dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="h-7 flex justify-center items-center">
              <div className="w-20 h-1 rounded-full bg-gray-700" />
            </div>
            <div className="bg-white overflow-hidden" style={{ height: 'calc(100vh - 12.5rem)' }}>
              <iframe
                src={url}
                title="Preview bio"
                className="border-0 bg-white origin-top-left"
                style={{
                  width: '111.111%',
                  height: '111.111%',
                  transform: 'scale(0.9)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-100 dark:border-slate-700 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 transition-all"
          >
            <ExternalLink size={16} strokeWidth={2.5} />
            Buka Halaman Publik
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
