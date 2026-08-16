import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Copy, Loader2, Share2 } from 'lucide-react';

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
 * Semua I/O (fetch, clipboard, share, toast, analytics) dioper induk lewat
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
  onCopy: () => void;
  onShare: () => void;
}

export default function SnippetSheet({
  source,
  body,
  loading,
  error,
  onRetry,
  onClose,
  onCopy,
  onShare,
}: SnippetSheetProps) {
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const open = source !== null;

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
            <div className="mx-auto grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              {/* Pola tombol ikon header dashboard (DashboardLayout ~713): hit-area
                  44px TRANSPARAN membungkus chip yang terlihat. Ukurannya ikut
                  varian COMPACT — `compactHeader = activeTab === 'teras'`, jadi
                  chip Teras adalah 32px rounded-lg, bukan 36px rounded-xl.
                  Margin negatifnya sengaja hanya horizontal: `-m-1.5` seperti di
                  dashboard akan memendekkan baris header sheet ini jadi 32px,
                  padahal sheet saudaranya (komposer, editor lampiran) semua
                  berbaris 44px. -mx-1.5 membuat tepi kiri chip jatuh persis di
                  px-4 kontainer. */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup lampiran teks"
                className="group -mx-1.5 flex h-11 w-11 shrink-0 items-center justify-center justify-self-start focus-visible:outline-none"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100/80 text-gray-600 transition-all group-hover:bg-gray-200 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-emerald-500/50 dark:bg-slate-800/80 dark:text-slate-300 dark:group-hover:bg-slate-700">
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </span>
              </button>
              <h2
                id="teras-snippet-sheet-title"
                className="text-center text-sm font-bold text-gray-900 dark:text-white"
              >
                Lampiran Teks
              </h2>
              <button
                type="button"
                onClick={onCopy}
                disabled={!body}
                aria-label="Salin teks lampiran"
                title={body ? 'Salin teks lampiran' : 'Menunggu teks selesai dimuat'}
                className="group -mx-1.5 flex h-11 w-11 shrink-0 items-center justify-center justify-self-end disabled:opacity-40 focus-visible:outline-none"
              >
                {/* size 14 mengikuti aksi kanan header Teras (toggle mode gelap
                    & lonceng), bukan 16 milik chevron back. */}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100/80 text-gray-500 transition-all group-hover:bg-gray-200 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-emerald-500/50 dark:bg-slate-800/80 dark:text-slate-300 dark:group-hover:bg-slate-700">
                  <Copy size={14} />
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
                onClick={onCopy}
                disabled={!body}
                className="flex min-h-11 flex-[2] items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 text-[13px] font-extrabold text-white shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-45 dark:shadow-emerald-950/40"
              >
                {loading && !body ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />}
                Salin teks
              </button>
              <button
                type="button"
                onClick={onShare}
                disabled={!body}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-4 text-[13px] font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-45 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Share2 size={15} />
                Bagikan
              </button>
            </div>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
