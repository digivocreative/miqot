import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Clock3, Send, X } from 'lucide-react';
import MagicLinkModal from './MagicLinkModal';

interface Props {
  jamaahId: number;
  jamaahName: string;
  jamaahWa: string | null;
  idUmroh: string;
  agentSlug: string;
  agentName: string;
  className?: string;
  iconClassName?: string;
  label?: string;
}

const ENABLED_PORTAL_AGENT_SLUGS = new Set(['nikita']);

export default function MagicLinkButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const canGenerateMagicLink = ENABLED_PORTAL_AGENT_SLUGS.has(props.agentSlug.toLowerCase());

  if (!props.agentSlug) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (canGenerateMagicLink) {
            setOpen(true);
          } else {
            setComingSoonOpen(true);
          }
        }}
        className={props.className || 'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all active:scale-95'}
        title="Kirim Akses Portal"
      >
        <Send className={props.iconClassName || 'w-3.5 h-3.5'} strokeWidth={2.2} />
        <span className="whitespace-nowrap">{props.label || 'Magic Link'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <MagicLinkModal
            {...props}
            onClose={() => setOpen(false)}
          />
        )}
        {comingSoonOpen && (
          <PortalComingSoonModal
            agentName={props.agentName}
            onClose={() => setComingSoonOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PortalComingSoonModal({ agentName, onClose }: { agentName: string; onClose: () => void }) {
  const benefits = [
    'Agent bisa kirim akses portal jamaah tanpa password.',
    'Jamaah dapat pantau pembayaran, persiapan, dokumen, dan perlengkapan.',
    'Info perjalanan dan itinerary terkumpul di satu halaman.',
    'Mengurangi chat manual berulang karena jamaah bisa cek status sendiri.',
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700/50">
          <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <Clock3 className="w-4 h-4" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Portal Jamaah Segera Hadir</h2>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Fitur akan tersedia dalam waktu dekat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100/80 dark:bg-slate-700/80 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors active:scale-95"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-2xl border border-violet-100 dark:border-violet-800/40 bg-violet-50/70 dark:bg-violet-900/20 p-3">
            <p className="text-xs font-bold text-violet-700 dark:text-violet-300">Manfaat fitur ini</p>
            <div className="mt-2 space-y-2">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" strokeWidth={2.4} />
                  <p className="text-xs leading-relaxed text-gray-700 dark:text-slate-300">{benefit}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full inline-flex items-center justify-center py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95"
          >
            Mengerti
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
