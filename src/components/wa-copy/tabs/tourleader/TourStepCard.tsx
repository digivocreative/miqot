import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../../utils/waLink';
import type { TourStep } from '../../lib/types';
import MediaView from '../../admin/MediaView';

interface TourStepCardProps {
  entry: TourStep;
  index: number;
  showToast: (msg: string) => void;
}

export default function TourStepCard({ entry, index, showToast }: TourStepCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = `${entry.title}\n\n${entry.body}`;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      showToast('Langkah tersalin ke clipboard');
      setTimeout(() => setCopied(false), 1800);
    } else {
      showToast('Gagal menyalin teks');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">{entry.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-slate-300 whitespace-pre-wrap">{entry.body}</p>
          <button
            onClick={handleCopy}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
          >
            {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
            {copied ? 'Tersalin' : 'Salin Langkah'}
          </button>
          {entry.media?.[0] && (
            <div className="mt-3">
              <MediaView media={entry.media[0]} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
