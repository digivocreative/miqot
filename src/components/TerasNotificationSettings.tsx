import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AtSign, Heart, Megaphone, MessageCircle, Bell, Send, Settings, Timer, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { TerasPrefKey, TerasPrefs } from '../hooks/useTerasNotificationPrefs';

// Sama persis dengan SIZE_CLASSES di NotificationBell.tsx — gerigi berdiri di
// antara lonceng dan toggle tema, jadi ketiganya harus seukuran di tiap header.
const SIZE_CLASSES: Record<'compact' | 'header' | 'home', { button: string; icon: number }> = {
  compact: { button: 'h-8 w-8 rounded-lg', icon: 14 },
  header: { button: 'h-11 w-11 rounded-xl', icon: 16 },
  home: { button: 'w-9 h-9 rounded-xl', icon: 16 },
};

const ROWS: { icon: typeof AtSign; title: string; caption: string; bell: TerasPrefKey; telegram: TerasPrefKey }[] = [
  { icon: AtSign, title: 'Sebutan (@nama)', caption: 'Saat kamu disebut', bell: 'teras_bell_mention', telegram: 'community_mentions' },
  { icon: MessageCircle, title: 'Balasan & komentar', caption: 'Di kiriman kamu', bell: 'teras_bell_comment', telegram: 'teras_tg_comment' },
  { icon: Heart, title: 'Reaksi', caption: 'Suka di kiriman kamu', bell: 'teras_bell_reaction', telegram: 'teras_tg_reaction' },
  { icon: Megaphone, title: 'Pengumuman @semua', caption: 'Dari agen lain', bell: 'teras_bell_broadcast', telegram: 'teras_tg_broadcast' },
];

function Switch({ checked, disabled, label, onToggle }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`flex h-[26px] w-11 shrink-0 items-center rounded-full p-[3px] transition-colors disabled:opacity-40 ${
        checked ? 'justify-end bg-emerald-500' : 'justify-start bg-gray-200 dark:bg-slate-600'
      }`}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

export default function TerasNotificationSettings({
  size, prefs, telegramConnected, open, loading, loaded, error, onOpen, onClose, onToggle,
}: {
  size: 'compact' | 'header' | 'home';
  prefs: TerasPrefs;
  telegramConnected: boolean;
  open: boolean;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onToggle: (key: TerasPrefKey) => void;
}) {
  const reduceMotion = useReducedMotion();
  const sizing = SIZE_CLASSES[size];
  const headingId = useId();
  const gearButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      gearButtonRef.current?.focus();
    };
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        ref={gearButtonRef}
        onClick={onOpen}
        aria-label="Pengaturan notifikasi Teras"
        title="Pengaturan notifikasi Teras"
        className={`flex shrink-0 items-center justify-center transition-colors active:scale-95 ${sizing.button} ${
          open
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-gray-100/80 text-gray-500 hover:bg-gray-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
      >
        <Settings size={sizing.icon} />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="teras-prefs-scrim"
                className="fixed inset-0 z-40 bg-slate-900/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
              />
              <motion.div
                key="teras-prefs-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl border-t border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                transition={{ type: 'tween', duration: 0.22 }}
              >
                <div className="flex justify-center pb-0.5 pt-2">
                  <span className="h-1 w-9 rounded-full bg-gray-200 dark:bg-slate-600" />
                </div>

                <div className="flex items-center justify-between px-4 pb-3 pt-2.5">
                  <h2 id={headingId} className="text-sm font-bold text-gray-900 dark:text-white">Notifikasi Teras</h2>
                  <button
                    type="button"
                    ref={closeButtonRef}
                    onClick={onClose}
                    aria-label="Tutup"
                    className="text-gray-400 dark:text-slate-500"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 px-4 pb-2">
                  <span className="flex-1" />
                  <span className="flex w-[50px] justify-center text-gray-500 dark:text-slate-400"><Bell size={14} /></span>
                  <span className="flex w-[50px] justify-center text-[10px] font-semibold text-gray-500 dark:text-slate-400">Telegram</span>
                </div>

                <div className="border-t border-gray-100 px-4 py-0.5 dark:border-slate-700">
                  {loading && <p className="py-6 text-center text-[13px] text-gray-400 dark:text-slate-500">Memuat…</p>}
                  {!loading && !loaded && (
                    // Load awal gagal: JANGAN render matriks saklar sama sekali — nilainya
                    // masih DEFAULT_PREFS (fabrikasi), bukan posisi asli agen. Tampilkan
                    // error di sini, menggantikan baris, bukan berdampingan dengannya.
                    <p role="alert" className="py-6 text-center text-[13px] font-medium text-red-500 dark:text-red-400">
                      {error ?? 'Gagal memuat pengaturan.'}
                    </p>
                  )}
                  {!loading && loaded && ROWS.map(row => {
                    const Icon = row.icon;
                    return (
                      <div key={row.bell} className="flex items-center gap-1.5 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1 pl-1">
                          <span className="block truncate text-[14px] font-semibold text-gray-900 dark:text-white">{row.title}</span>
                          <span className="block truncate text-[11px] text-gray-400 dark:text-slate-500">{row.caption}</span>
                        </span>
                        <span className="flex w-[50px] justify-center">
                          <Switch checked={prefs[row.bell]} label={`${row.title} di lonceng`} onToggle={() => onToggle(row.bell)} />
                        </span>
                        <span className={`flex w-[50px] justify-center ${telegramConnected ? '' : 'opacity-40'}`}>
                          <Switch
                            checked={prefs[row.telegram]}
                            disabled={!telegramConnected}
                            label={`${row.title} ke Telegram`}
                            onToggle={() => onToggle(row.telegram)}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>

                {!loading && loaded && !telegramConnected && (
                  <a
                    href="/dashboard/settings/telegram"
                    className="flex items-center gap-2.5 border-t border-gray-100 bg-emerald-50 px-4 py-3 dark:border-slate-700 dark:bg-emerald-900/20"
                  >
                    <Send size={15} className="text-sky-500 dark:text-sky-400" />
                    <span className="flex-1 text-[12px] font-medium text-gray-600 dark:text-slate-300">Telegram belum tersambung</span>
                    <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Sambungkan</span>
                  </a>
                )}

                {loaded && error && (
                  <p role="alert" className="border-t border-gray-100 px-4 py-2 text-[12px] font-medium text-red-500 dark:border-slate-700 dark:text-red-400">{error}</p>
                )}

                <div className="flex items-start gap-2 border-t border-gray-100 bg-gray-50 px-4 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-3 dark:border-slate-700 dark:bg-slate-950">
                  <Timer size={13} className="mt-0.5 shrink-0 text-gray-400 dark:text-slate-500" />
                  <p className="text-[11px] leading-[1.4] text-gray-400 dark:text-slate-500">
                    Komentar &amp; reaksi dikirim terkumpul tiap 10 menit.
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
