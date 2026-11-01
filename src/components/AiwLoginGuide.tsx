import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BarChart3, Bell, ChevronDown, LayoutGrid, Users } from 'lucide-react';
import AiwOfficeLoginImage from './AiwOfficeLoginImage';

const BENEFITS = [
  { icon: LayoutGrid, text: 'Semua menu terbuka, dari Jadwal sampai Tools' },
  { icon: Users, text: 'Data jamaah umroh dan haji tersinkron otomatis' },
  { icon: BarChart3, text: 'Statistik dan komisi terhitung otomatis' },
  { icon: Bell, text: 'Notifikasi jamaah baru dan pembayaran di Telegram' },
];

/** Bagian bawah form Akun AIW: penjelasan akun yang dimaksud dan manfaatnya. */
export default function AiwLoginGuide() {
  const [helpOpen, setHelpOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <>
      <button
        type="button"
        aria-expanded={helpOpen}
        onClick={() => setHelpOpen(open => !open)}
        className="mx-auto flex min-h-11 items-center gap-1 px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
      >
        Akun yang mana?
        <ChevronDown
          size={13}
          className={`transition-transform duration-200 motion-reduce:transition-none ${helpOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Jarak 16px milik space-y-4 form ikut beranimasi: kalau dibiarkan, ia melompat saat panel terpasang. */}
      <AnimatePresence initial={false}>
        {helpOpen && (
          <motion.div
            key="aiw-help"
            data-aiw-help
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs leading-relaxed text-gray-600 dark:text-slate-300">
                Pakai akun yang sama dengan login kantor Alhijaz Indowisata (Kantor Cabang).
              </p>
              <AiwOfficeLoginImage className="mt-2" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
        <h3 className="text-xs font-bold text-emerald-800 dark:text-emerald-200">Apa manfaat menghubungkan akun?</h3>
        <ul className="mt-2 space-y-1.5">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-200">
              <Icon size={14} className="mt-px shrink-0" /> {text}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
