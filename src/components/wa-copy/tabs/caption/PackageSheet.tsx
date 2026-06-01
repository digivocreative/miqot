import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Check, Search, X } from 'lucide-react';
import type { UmrohPackage } from '@/types/umroh-package';
import { buildPackageContext } from '../../lib/placeholders';

interface PackageSheetProps {
  packages: UmrohPackage[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (jadwalId: string | null) => void;
  onClose: () => void;
}

/**
 * Bottom sheet for picking the package whose data fills the caption tokens.
 * Cloned from the BirthdayDetailSheet shell (portal + backdrop + slide-up panel);
 * exit animations are driven by an <AnimatePresence> in the parent.
 */
export default function PackageSheet({ packages, selectedId, loading, onSelect, onClose }: PackageSheetProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter(
      p => p.nama.toLowerCase().includes(q) || p.maskapai.toLowerCase().includes(q),
    );
  }, [packages, query]);

  const choose = (jadwalId: string | null) => {
    onSelect(jadwalId);
    onClose();
  };

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 max-h-[85vh] overflow-y-auto shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md z-10 border-b border-gray-100 dark:border-slate-700/50">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
          </div>
          <div className="px-4 pb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">Tempel Paket</h3>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-700/80 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors flex-shrink-0 active:scale-95"
              aria-label="Tutup"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 pb-3">
          <div className="relative rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cari paket atau maskapai…"
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none text-gray-800 dark:text-white placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="px-4 pb-6 space-y-2">
          <button
            onClick={() => choose(null)}
            className="w-full text-left px-4 py-3 rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 shadow-sm active:scale-[0.98] transition-all flex items-center justify-between gap-3"
          >
            <span className="text-sm font-semibold text-gray-600 dark:text-slate-300">Tanpa paket</span>
            {selectedId === null && <Check size={16} className="text-emerald-500" />}
          </button>

          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-gray-100 dark:bg-slate-700 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-8">Paket tidak ditemukan.</p>
          )}

          {!loading &&
            filtered.map(pkg => {
              const ctx = buildPackageContext(pkg);
              const isSelected = pkg.jadwalId === selectedId;
              return (
                <button
                  key={pkg.jadwalId}
                  onClick={() => choose(pkg.jadwalId)}
                  className={`w-full text-left px-4 py-3 rounded-2xl border shadow-sm transition-all active:scale-[0.98] flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-gray-800 dark:text-white truncate">{pkg.nama}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                      {[ctx.tanggal, ctx.maskapai, ctx.harga ? `mulai ${ctx.harga}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {isSelected && <Check size={16} className="text-emerald-500 flex-shrink-0" />}
                </button>
              );
            })}
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
