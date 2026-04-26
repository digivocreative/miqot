import { ExternalLink } from 'lucide-react';
import SheetBase from './SheetBase';

interface Props {
  open: boolean;
  onClose: () => void;
  slug: string;
}

export default function SheetPreview({ open, onClose, slug }: Props) {
  const url = `/${slug}/bio`;

  return (
    <SheetBase open={open} onClose={onClose} title="Preview Bio">
      <div className="space-y-3">
        <div className="rounded-[1.75rem] border-8 border-gray-900 dark:border-slate-950 bg-gray-900 dark:bg-slate-950 shadow-xl overflow-hidden mx-auto max-w-[320px]">
          <div className="h-5 flex justify-center items-center">
            <div className="w-16 h-1 rounded-full bg-gray-700" />
          </div>
          <iframe
            src={url}
            title="Preview bio"
            className="w-full bg-white border-0"
            style={{ height: '62vh' }}
          />
        </div>
        <button
          type="button"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-md shadow-emerald-500/25 hover:bg-emerald-600 active:scale-95 transition-all"
        >
          <ExternalLink size={14} strokeWidth={2.5} />
          Buka Halaman Publik
        </button>
      </div>
    </SheetBase>
  );
}
