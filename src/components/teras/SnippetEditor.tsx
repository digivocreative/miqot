import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ClipboardPaste } from 'lucide-react';

/**
 * Editor lampiran teks Teras — sheet fullscreen di atas komposer.
 *
 * Komponen ini SENGAJA bodoh, pola yang sama dengan ComposerSegment: tidak ada
 * fetch, tidak ada localStorage, tidak ada state portal global. Induk
 * (TerasPage) yang memiliki draf, penyimpanan, dan publikasi — di sini cuma
 * ada teks yang sedang diketik plus tombol Simpan/Batal.
 *
 * Batas panjang dioper lewat props (bukan konstanta lokal) supaya hanya ada
 * SATU sumber angka: TerasPage, yang juga memakainya untuk kartu ringkas di
 * footer komposer.
 */

interface SnippetEditorProps {
  open: boolean;
  initialTitle: string;
  initialBody: string;
  /** Komposer sedang mengirim — kunci semua kontrol, jangan tutup sheet. */
  busy: boolean;
  maxChars: number;
  maxTitleChars: number;
  /** Sedikit di atas maxTitleChars supaya judul tempelan tidak dipangkas senyap. */
  titleHardCap: number;
  onCancel: () => void;
  onSave: (value: { title: string; body: string }) => void;
}

export default function SnippetEditor({
  open,
  initialTitle,
  initialBody,
  busy,
  maxChars,
  maxTitleChars,
  titleHardCap,
  onCancel,
  onSave,
}: SnippetEditorProps) {
  const reduceMotion = useReducedMotion();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Tombol yang membuka sheet ini (toolbar "Lampiran" atau "Ubah" di kartu) —
  // fokus dikembalikan ke sana saat sheet tutup.
  const triggerRef = useRef<HTMLElement | null>(null);

  const length = Array.from(body.trim()).length;
  const titleLength = Array.from(title.trim()).length;
  const overLimit = length > maxChars;
  const titleOverLimit = titleLength > maxTitleChars;
  const canSave = length >= 1 && !overLimit && !titleOverLimit && !busy;

  // Muat ulang isi + rebut fokus tiap kali sheet dibuka. rAF menunggu state
  // di atas benar-benar ter-render, supaya caret mendarat di akhir teks yang
  // BARU, bukan di akhir teks sesi sebelumnya.
  useEffect(() => {
    if (!open) return undefined;
    setTitle(initialTitle);
    setBody(initialBody);
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    });
    return () => window.cancelAnimationFrame(frame);
    // Sengaja hanya bergantung pada `open`: nilai awal dibaca sekali per buka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Kembalikan fokus ke pemanggil saat sheet ditutup (cleanup effect, bukan
  // AnimatePresence#onExitComplete yang bisa gagal terpanggil).
  useEffect(() => {
    if (!open) return undefined;
    return () => triggerRef.current?.focus();
  }, [open]);

  // Auto-grow, sama seperti textarea segmen komposer.
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [body, open]);

  const handleCancel = useCallback(() => {
    if (busy) return;
    // Teks panjang tidak boleh hilang karena satu tap salah — konfirmasi hanya
    // kalau memang ada isi yang berubah, pola yang sama dengan closeComposer.
    const dirty = body !== initialBody || title !== initialTitle;
    if (dirty && body.trim() && !window.confirm('Buang perubahan lampiran?')) return;
    onCancel();
  }, [body, title, initialBody, initialTitle, busy, onCancel]);

  // Escape menutup + jebakan fokus di dalam sheet. TerasPage menonaktifkan
  // handler Escape komposer selagi sheet ini terbuka, jadi satu Escape tidak
  // ikut membuang seluruh kiriman yang sedang disusun.
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleCancel();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleCancel]);

  // Tombol Tempel hanya masuk akal kalau Clipboard API benar-benar ada
  // (Safari di origin non-HTTPS tidak punya navigator.clipboard sama sekali).
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

  const handlePaste = async () => {
    const node = textareaRef.current;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      // selectionStart/End memakai indeks UTF-16, sama dengan String.slice —
      // jadi sisipan mendarat tepat di kursor, termasuk setelah emoji.
      const start = node?.selectionStart ?? body.length;
      const end = node?.selectionEnd ?? body.length;
      const next = `${body.slice(0, start)}${text}${body.slice(end)}`;
      setBody(next);
      const caret = start + text.length;
      window.requestAnimationFrame(() => {
        node?.focus();
        node?.setSelectionRange(caret, caret);
      });
    } catch {
      // Izin clipboard ditolak / tidak tersedia — senyap by design. Pengguna
      // masih bisa menempel lewat keyboard atau menu tempel bawaan sistem,
      // jadi galat merah di sini cuma kebisingan.
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="teras-snippet-editor"
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="teras-snippet-editor-title"
          // z-[60]: di atas sheet komposer (z-50), di bawah toast (z-[70]).
          className="fixed inset-0 z-[60] flex h-[100dvh] min-h-[100dvh] flex-col bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/95">
            <div className="mx-auto grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="min-h-11 min-w-11 justify-self-start px-1 text-[13px] font-semibold text-gray-600 transition-colors disabled:opacity-45 dark:text-slate-300"
              >
                Batal
              </button>
              <h2
                id="teras-snippet-editor-title"
                className="text-center text-sm font-bold text-gray-900 dark:text-white"
              >
                Lampiran Teks
              </h2>
              {/* Hit-area 44px, pil visual 36px — pola tombol Post komposer. */}
              <button
                type="button"
                onClick={() => onSave({ title, body })}
                disabled={!canSave}
                aria-label="Simpan lampiran teks"
                className="flex min-h-11 items-center justify-center justify-self-end transition-all active:scale-95 disabled:opacity-45"
              >
                <span className="flex min-h-9 min-w-[72px] items-center justify-center rounded-full bg-emerald-500 px-4 py-1.5 text-[12px] font-extrabold text-white shadow-md shadow-emerald-500/20 dark:bg-emerald-500 dark:shadow-emerald-950/40">
                  Simpan
                </span>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-4">
              <input
                type="text"
                value={title}
                onChange={event => setTitle(event.target.value)}
                disabled={busy}
                maxLength={titleHardCap}
                aria-label="Judul lampiran"
                placeholder="Judul (opsional)"
                className="w-full bg-transparent p-0 text-[19px] font-extrabold text-gray-900 outline-none placeholder:font-bold placeholder:text-gray-400 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-500"
              />
              {titleOverLimit && (
                <p className="mt-1 text-[10px] font-medium text-red-500 dark:text-red-400">
                  Judul maksimal {maxTitleChars} karakter
                </p>
              )}

              <div aria-hidden="true" className="my-3 h-px bg-gray-100 dark:bg-slate-700/60" />

              <textarea
                ref={textareaRef}
                value={body}
                onChange={event => setBody(event.target.value)}
                disabled={busy}
                aria-label="Isi lampiran teks"
                placeholder="Tulis atau tempel teks panjang di sini…"
                // Sengaja TANPA maxLength: memangkas diam-diam tempelan 30.000
                // karakter justru bentuk kehilangan tulisan yang paling sulit
                // disadari. Kelebihan ditandai penghitung merah + Simpan mati.
                className="min-h-[40vh] w-full resize-none overflow-hidden bg-transparent p-0 text-[16px] leading-[1.65] text-gray-900 outline-none placeholder:text-gray-500 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-400"
              />
            </div>
          </div>

          <footer className="sticky bottom-0 border-t border-gray-100 bg-white/95 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/95">
            <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
              {canPaste && (
                <button
                  type="button"
                  onClick={() => void handlePaste()}
                  disabled={busy}
                  title="Tempel dari papan klip di posisi kursor"
                  className="-ml-2 flex min-h-11 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-35 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 dark:active:bg-slate-800"
                >
                  <ClipboardPaste size={18} strokeWidth={1.8} />
                  Tempel
                </button>
              )}
              <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-gray-400 dark:text-slate-500">
                Teks polos. Baris baru dipertahankan.
              </span>
              <span
                aria-live="polite"
                className={`shrink-0 text-[10px] font-semibold tabular-nums ${
                  overLimit ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-slate-400'
                }`}
              >
                {length.toLocaleString('id-ID')}/{maxChars.toLocaleString('id-ID')}
              </span>
            </div>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
