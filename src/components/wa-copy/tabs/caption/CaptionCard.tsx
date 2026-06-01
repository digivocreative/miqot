import { useState } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import { resolveToPlain } from '../../lib/placeholders';
import { copyToClipboard, shareCaption } from '../../utils/waLink';
import type { AgentContext, CaptionEntry, PackageContext } from '../../lib/types';
import PreviewText from './PreviewText';
import MediaView from '../../admin/MediaView';

interface CaptionCardProps {
  entry: CaptionEntry;
  categoryLabel: string;
  agentCtx: AgentContext;
  pkgCtx: PackageContext | null;
  showToast: (msg: string) => void;
}

export default function CaptionCard({ entry, categoryLabel, agentCtx, pkgCtx, showToast }: CaptionCardProps) {
  const [copied, setCopied] = useState(false);
  const ctx = { agent: agentCtx, pkg: pkgCtx };

  const handleCopy = async () => {
    const plain = resolveToPlain(entry.template, ctx);
    const ok = await copyToClipboard(plain);
    if (ok) {
      setCopied(true);
      showToast('Teks tersalin ke clipboard');
      setTimeout(() => setCopied(false), 1800);
    } else {
      showToast('Gagal menyalin teks');
    }
  };

  const handleSend = () => {
    shareCaption(resolveToPlain(entry.template, ctx));
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
            {categoryLabel}
          </span>
          {entry.packageAware && (
            <span className="text-[9px] font-bold uppercase tracking-wide bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
              Pakai Paket
            </span>
          )}
        </div>
      </div>
      {entry.media?.[0] && (
        <div className="px-4 pt-4">
          <MediaView media={entry.media[0]} />
        </div>
      )}
      <div className="p-4">
        <PreviewText template={entry.template} ctx={ctx} />
      </div>
      <div className="flex border-t border-gray-100 dark:border-slate-700">
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors active:scale-95"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {copied ? 'Tersalin' : 'Salin'}
        </button>
        <div className="w-px bg-gray-100 dark:bg-slate-700" />
        <button
          onClick={handleSend}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors active:scale-95"
        >
          <Send size={14} />
          Kirim WA
        </button>
      </div>
    </div>
  );
}
