import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronLeft, Copy, Loader2 } from 'lucide-react';

import { AgentAvatar } from './AgentAvatar';
import { timeAgo } from '../../lib/communityNotifications';

/**
 * Pembaca lampiran teks — sheet fullscreen di atas feed.
 *
 * Body 10.000 karakter TIDAK ikut di payload feed (lihat
 * loadCommunitySnippetMaps di server.js), jadi sheet ini yang menariknya lewat
 * GET /api/community/posts/:id/snippet begitu dibuka. Selama menunggu, yang
 * ditampilkan adalah `preview` yang SUDAH ada di tangan dari kartu feed,
 * ditutup mask fade — teks yang sudah dimiliki selalu lebih baik daripada
 * spinner di layar kosong, dan pembaca bisa mulai membaca kalimat pertama
 * sebelum sisanya tiba.
 *
 * Semua I/O (fetch, clipboard, toast, analytics) dioper induk lewat
 * props: komponen ini hanya tahu cara merender dan kapan memanggil.
 */

export interface SnippetSheetSource {
  postId: string;
  title: string | null;
  preview: string;
  charCount: number;
  authorName: string;
  authorPhoto?: string | null;
  createdAt: string;
}

interface SnippetSheetProps {
  source: SnippetSheetSource | null;
  /** Body penuh; null selama belum tiba. */
  body: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  /**
   * Menyalin body ke clipboard. Mengembalikan `true` HANYA kalau clipboard
   * benar-benar terisi — itu yang menentukan boleh-tidaknya tombol berubah
   * jadi centang. Centang yang berbohong lebih buruk daripada tidak ada
   * centang: agent menutup sheet, menempel di WhatsApp, dan dapat teks lama.
   */
  onCopy: () => Promise<boolean>;
}

/**
 * Umur tanda "Tersalin" sebelum tombol kembali ke keadaan semula. Cukup lama
 * untuk terbaca, cukup pendek supaya tombol tidak tampak macet di keadaan
 * sukses saat agent ingin menyalin ulang.
 */
const COPIED_RESET_MS = 1200;

/**
 * Pergantian ikon salin <-> centang.
 *
 * `AnimatePresence mode="wait"` MENDERETKAN keluar lalu masuk, jadi yang
 * terasa oleh mata adalah exit + enter, bukan yang lebih panjang di antaranya.
 * Itu sebabnya exit-nya tween 80ms yang tegas — spring untuk exit terasa lambat
 * justru karena ia mengendap pelan menuju nol. Yang bermain hanya bagian masuk:
 * spring kaku dengan damping rendah supaya centangnya MENYENTAK melewati
 * ukuran akhirnya sedikit, lalu mengunci.
 */
const ICON_EXIT = { duration: 0.08, ease: 'easeIn' } as const;
const ICON_ENTER = { type: 'spring', stiffness: 900, damping: 16, mass: 0.45 } as const;

export default function SnippetSheet({
  source,
  body,
  loading,
  error,
  onRetry,
  onClose,
  onCopy,
}: SnippetSheetProps) {
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const open = source !== null;
  const [copied, setCopied] = useState(false);
  const [copyPulse, setCopyPulse] = useState(0);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  // Tanda "Tersalin" milik SATU lampiran: tutup sheet atau buka lampiran lain,
  // dan ia harus kembali ke keadaan awal — bukan menyeberang dan mengaku
  // teks yang sekarang di clipboard adalah teks yang sedang dibaca.
  useEffect(() => {
    setCopied(false);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }, [source?.postId]);

  const handleCopy = useCallback(async () => {
    if (await onCopy() !== true) return;
    setCopied(true);
    // Penghitung, bukan boolean: menyalin ulang saat masih "Tersalin" tidak
    // mengubah `copied`, jadi riaknya tidak akan main lagi tanpa kunci baru.
    setCopyPulse(pulse => pulse + 1);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      copiedTimerRef.current = null;
      setCopied(false);
    }, COPIED_RESET_MS);
  }, [onCopy]);

  // Rebut fokus + ingat pemanggil, pola yang sama dengan sheet lain di Teras.
  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => sheetRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      triggerRef.current?.focus();
    };
  }, [open]);

  // Escape menutup, Tab tetap di dalam sheet. Trap-nya wajib: `aria-modal`
  // saja tidak menahan fokus, dan halaman di belakang tidak di-inert — tanpa
  // ini Tab keluar ke feed yang tertutup layar penuh.
  const handleKeyDown = useCallback((event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !sheetRef.current) return;
    const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // Kunci scroll halaman selama sheet terbuka — tanpa ini badan feed ikut
  // bergulir di belakang teks panjang.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {source && (
        <motion.div
          key="teras-snippet-sheet"
          ref={sheetRef}
          data-teras-snippet-sheet
          role="dialog"
          aria-modal="true"
          aria-labelledby="teras-snippet-sheet-title"
          aria-busy={loading}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex h-[100dvh] min-h-[100dvh] flex-col bg-white outline-none dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/95">
            {/* Tinggi baris & padding disalin PERSIS dari header Teras
                (DashboardLayout ~666, cabang compactHeader): pb-1.5 +
                pt-[max(0.375rem,…)] + gap-2, dengan tombol ber-`-m-1.5`.
                Margin negatif dua sumbu itulah yang memendekkan baris jadi
                32px — hit-area 44px-nya tetap utuh, cuma tidak lagi ikut
                menentukan tinggi header. */}
            <div className="mx-auto grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
              {/* Pola tombol ikon header dashboard (DashboardLayout ~713): hit-area
                  44px TRANSPARAN membungkus chip yang terlihat. Ukurannya ikut
                  varian COMPACT — `compactHeader = activeTab === 'teras'`, jadi
                  chip Teras adalah 32px rounded-lg, bukan 36px rounded-xl. */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup lampiran teks"
                className="group -m-1.5 flex h-11 w-11 shrink-0 items-center justify-center justify-self-start focus-visible:outline-none"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100/80 text-gray-600 transition-all group-hover:bg-gray-200 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-emerald-500/50 dark:bg-slate-800/80 dark:text-slate-300 dark:group-hover:bg-slate-700">
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </span>
              </button>
              <h2
                id="teras-snippet-sheet-title"
                className="text-center text-[13px] font-bold text-gray-900 dark:text-white"
              >
                Lampiran Teks
              </h2>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!body}
                aria-label={copied ? 'Teks lampiran tersalin' : 'Salin teks lampiran'}
                title={body ? 'Salin teks lampiran' : 'Menunggu teks selesai dimuat'}
                className="group -m-1.5 flex h-11 w-11 shrink-0 items-center justify-center justify-self-end disabled:opacity-40 focus-visible:outline-none"
              >
                {/* size 14 mengikuti aksi kanan header Teras (toggle mode gelap
                    & lonceng), bukan 16 milik chevron back. */}
                <span
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg transition-colors duration-150 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-emerald-500/50 ${
                    copied
                      ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
                      : 'bg-gray-100/80 text-gray-500 group-hover:bg-gray-200 dark:bg-slate-800/80 dark:text-slate-300 dark:group-hover:bg-slate-700'
                  }`}
                >
                  {/* Riak sekali-jalan: yang membuat keberhasilan TERASA,
                      bukan sekadar terbaca. Digambar di belakang ikon dan
                      selesai dalam 0,35 dtk. */}
                  {copied && !reduceMotion && (
                    <motion.span
                      key={copyPulse}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-lg bg-emerald-400/50"
                      initial={{ scale: 0.5, opacity: 0.8 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                    />
                  )}
                  {/* mode="wait": ikon lama keluar dulu, baru yang baru masuk —
                      kalau tumpang-tindih, dua ikon sempat terlihat di kotak
                      32px yang sama. */}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copied ? 'tersalin' : 'salin'}
                      className="relative flex"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
                      animate={reduceMotion
                        ? { opacity: 1 }
                        : { opacity: 1, scale: 1, transition: ICON_ENTER }}
                      exit={reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, scale: 0.3, transition: ICON_EXIT }}
                      transition={reduceMotion ? { duration: 0 } : undefined}
                    >
                      {copied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <AgentAvatar name={source.authorName} photo={source.authorPhoto} size="comment" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-gray-900 dark:text-white">
                    {source.authorName}
                  </p>
                  <p className="text-[11px] tabular-nums text-gray-400 dark:text-slate-500">
                    {timeAgo(source.createdAt)} lalu · {source.charCount.toLocaleString('id-ID')} karakter
                  </p>
                </div>
              </div>

              {source.title && (
                <h3 className="mt-4 text-[22px] font-extrabold leading-[1.25] text-gray-900 [overflow-wrap:anywhere] dark:text-white">
                  {source.title}
                </h3>
              )}

              {error ? (
                <div className="mt-4">
                  <div
                    role="alert"
                    className="min-w-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 [overflow-wrap:anywhere] dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400"
                  >
                    {error}
                  </div>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-2 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold text-emerald-600 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    Coba lagi
                  </button>
                </div>
              ) : (
                // Mask fade hanya dipasang selama body belum tiba: ia menandai
                // "masih ada lanjutannya" pada cuplikan, dan harus lenyap
                // begitu teks penuh terpasang agar akhir tulisan tidak ikut
                // memudar.
                <div className={`relative mt-4 ${body ? '' : 'max-h-[60vh] overflow-hidden'}`}>
                  <p
                    data-teras-snippet-body
                    data-complete={body ? 'true' : 'false'}
                    className="whitespace-pre-wrap text-[16px] leading-[1.7] text-gray-800 [overflow-wrap:anywhere] dark:text-slate-200"
                  >
                    {body ?? source.preview}
                  </p>
                  {!body && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white dark:to-slate-950"
                    />
                  )}
                  {!body && (
                    <p role="status" aria-live="polite" className="sr-only">
                      {loading ? 'Memuat teks lengkap lampiran.' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <footer className="sticky bottom-0 border-t border-gray-100 bg-white/95 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/95">
            <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!body}
                className={`flex min-h-11 flex-1 items-center justify-center overflow-hidden rounded-full px-4 text-[13px] font-extrabold text-white shadow-md transition-colors active:scale-[0.98] disabled:opacity-45 ${
                  copied
                    ? 'bg-emerald-600 shadow-emerald-600/20 dark:shadow-emerald-950/40'
                    : 'bg-emerald-500 shadow-emerald-500/20 dark:shadow-emerald-950/40'
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={copied ? 'tersalin' : 'salin'}
                    className="flex items-center gap-1.5"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.85 }}
                    animate={reduceMotion
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0, scale: 1, transition: ICON_ENTER }}
                    exit={reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -10, scale: 0.85, transition: ICON_EXIT }}
                    transition={reduceMotion ? { duration: 0 } : undefined}
                  >
                    {copied ? (
                      <>
                        <Check size={15} strokeWidth={3} />
                        Tersalin
                      </>
                    ) : (
                      <>
                        {loading && !body ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />}
                        Salin teks
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
