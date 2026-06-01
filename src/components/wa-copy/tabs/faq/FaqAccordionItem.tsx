import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { copyToClipboard, shareCaption } from '../../utils/waLink';
import WhatsAppIcon from '../../../common/WhatsAppIcon';
import type { AgentFaqEntry } from '../../lib/types';

interface FaqAccordionItemProps {
  entry: AgentFaqEntry;
  open: boolean;
  onToggle: () => void;
  showToast: (msg: string) => void;
}

export default function FaqAccordionItem({ entry, open, onToggle, showToast }: FaqAccordionItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(entry.answer);
    if (ok) {
      setCopied(true);
      showToast('Jawaban tersalin ke clipboard');
      setTimeout(() => setCopied(false), 1800);
    } else {
      showToast('Gagal menyalin teks');
    }
  };

  const handleSend = () => {
    shareCaption(entry.answer);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 block text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">{entry.question}</span>
        <ChevronDown
          className={`h-5 w-5 flex-none text-gray-400 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 pb-3 pt-3 dark:border-slate-700/50">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-slate-300 whitespace-pre-wrap">{entry.answer}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="h-10 flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {copied ? <Check size={13} strokeWidth={2.5} className="text-emerald-500" /> : <Copy size={13} strokeWidth={2.5} />}
                  {copied ? 'Tersalin' : 'Salin'}
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  className="h-10 flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-95"
                >
                  <WhatsAppIcon size={14} />
                  Kirim via WA
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
