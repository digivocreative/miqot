import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Check, Image as ImageIcon } from 'lucide-react';
import { HOTEL_MEDIA_CATEGORY_PRESETS } from '../../lib/hotel-directory.js';

const SECTION_LABEL = 'text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500';
const INPUT_CLASS = 'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50';

// Cermin LIMITS.media_category di lib/hotel-directory.js — server menolak lebih.
const MAX_CATEGORY_LEN = 30;

interface Props {
  /** Kategori media yang sedang dibuka; '' = belum berkategori. */
  current: string;
  /** Kategori yang sudah dipakai hotel ini, agar bisa dipilih ulang tanpa mengetik. */
  used: string[];
  /** Item ini sudah jadi cover direktori. */
  isCover: boolean;
  /** Foto yang selesai diunggah bisa jadi cover; video tidak pernah bisa. */
  canMakeCover: boolean;
  onPick: (category: string) => void;
  onMakeCover: () => void;
  onClose: () => void;
}

/**
 * Bottom sheet "Pindahkan ke" untuk satu item media. Pola sama dengan
 * HotelFilterSheet: portal + backdrop + kunci scroll body + Escape.
 *
 * Preset SELALU ditawarkan meski hotel ini belum memakainya — itulah arti
 * "kategori default". Kategori bikinan sendiri lahir dari kolom ketik di bawah;
 * tidak ada daftar kategori tersimpan, jadi tak ada yang perlu dihapus manual:
 * kategori lenyap sendiri saat foto terakhirnya pindah.
 */
export default function HotelMediaCategorySheet({
  current, used, isCover, canMakeCover, onPick, onMakeCover, onClose,
}: Props) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Preset dulu, lalu kategori hotel ini yang bukan preset — dedup
  // case-insensitive supaya "lobby" tidak tampil bersanding dengan "Lobby".
  const presetKeys = new Set(HOTEL_MEDIA_CATEGORY_PRESETS.map(p => p.toLowerCase()));
  const extras = used.filter(c => !presetKeys.has(c.toLowerCase()));
  const options = [...HOTEL_MEDIA_CATEGORY_PRESETS, ...extras];

  const submitDraft = () => {
    const value = draft.trim();
    if (!value) return;
    onPick(value);
  };

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 max-h-[85vh] overflow-y-auto shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Atur media"
      >
        <div className="sticky top-0 z-10 flex justify-center bg-white pt-2 pb-1 dark:bg-slate-800">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        <div className="flex items-center gap-3 border-b border-gray-100 px-4 pt-2 pb-3 dark:border-slate-700/50">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-gray-900 dark:text-white">Atur media</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div>
            <p className={SECTION_LABEL}>Kategori</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {options.map(option => {
                const active = current.toLowerCase() === option.toLowerCase();
                return (
                  <button
                    key={option}
                    onClick={() => onPick(option)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'border border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {active && <Check size={12} strokeWidth={2.5} />}
                    {option}
                  </button>
                );
              })}
              <button
                onClick={() => onPick('')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  current
                    ? 'border border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                    : 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                }`}
              >
                {!current && <Check size={12} strokeWidth={2.5} />}
                Tanpa kategori
              </button>
            </div>
          </div>

          {/* Cover ikut ke sheet (permintaan user): thumbnail 84px sudah padat
              oleh tombol hapus + badge. Badge "Cover" di grid tinggal penanda,
              bukan tombol. Video tak pernah bisa jadi cover — makeCover di
              pemanggil memang menolaknya, jadi tombolnya disembunyikan. */}
          {canMakeCover && (
            <div>
              <p className={SECTION_LABEL}>Cover direktori</p>
              {isCover ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                  <Check size={13} strokeWidth={2.5} />
                  Foto ini sudah jadi cover
                </p>
              ) : (
                <button
                  onClick={onMakeCover}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white shadow-md shadow-teal-600/20 transition-all hover:bg-teal-700 active:scale-95"
                >
                  <ImageIcon size={14} strokeWidth={2.4} />
                  Jadikan cover
                </button>
              )}
              <p className="mt-1.5 text-[11px] text-gray-400 dark:text-slate-500">
                Foto yang tampil di kartu hotel pada daftar direktori.
              </p>
            </div>
          )}

          <div>
            <p className={SECTION_LABEL}>Kategori baru</p>
            <div className="mt-2 flex gap-2">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value.slice(0, MAX_CATEGORY_LEN))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitDraft(); } }}
                placeholder="mis. Kolam Renang"
                className={INPUT_CLASS}
              />
              <button
                onClick={submitDraft}
                disabled={!draft.trim()}
                className="shrink-0 rounded-xl bg-gray-100 px-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                Pakai
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>,
    document.body
  );
}
