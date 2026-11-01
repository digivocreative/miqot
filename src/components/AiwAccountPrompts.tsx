import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import AiwOfficeLoginImage from './AiwOfficeLoginImage';
import { useBackToClose } from '../hooks/useBackToClose';
import { lockDocumentScroll } from '../lib/scrollLock';

const DIALOG_EXIT_MS = 200;

/** Ajakan di beranda, menempati tempat banner Telegram selama menu masih terkunci. */
export function AiwLoginBanner({ onLogin }: { onLogin: () => void }) {
  return (
    <section className="mb-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-white shadow-md shadow-emerald-500/20 dark:from-emerald-600 dark:to-emerald-800">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700">
          <Lock size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">Hubungkan Akun AIW</h2>
          <p className="mt-0.5 text-xs text-emerald-50">Menu lainnya terbuka setelah akun terhubung.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogin}
        className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-emerald-700 transition-transform active:scale-[0.98]"
      >
        Hubungkan sekarang <ArrowRight size={15} />
      </button>
    </section>
  );
}

/** Muncul saat kartu bergembok diklik. Dipasang hanya selama terbuka. */
export function AiwLoginDialog({ menuLabel, onClose, onLogin }: {
  menuLabel: string;
  onClose: () => void;
  onLogin: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  useBackToClose(!closing, onClose);
  useEffect(() => (closing ? undefined : lockDocumentScroll()), [closing]);

  // Pindah halaman menunggu animasi keluar; entri riwayat dialog sudah dibuang saat itu.
  // Ketukan kedua selama animasi diabaikan: tanpa ini Login mendorong dua entri riwayat.
  const closeThen = useCallback((after: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(after, DIALOG_EXIT_MS);
  }, []);
  const dismiss = useCallback(() => closeThen(onClose), [closeThen, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismiss]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 ${closing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
      onClick={dismiss}
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiw-login-dialog-title"
        className={`max-h-[calc(100dvh-2rem)] w-full max-w-xs overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800 ${closing ? 'dc-card-exit' : 'dc-card-enter'}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="px-5 pb-3 pt-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-amber-100 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20">
            <Lock size={18} className="text-amber-500" />
          </div>
          <p id="aiw-login-dialog-title" className="text-sm font-bold text-gray-800 dark:text-white">Menu {menuLabel} masih terkunci</p>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
            Hubungkan akun AIW kantor untuk membukanya.
          </p>
          <AiwOfficeLoginImage className="mt-3" />
        </div>
        <div className="flex border-t border-gray-100 dark:border-slate-700">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 py-3 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-slate-700/50"
          >
            Batal
          </button>
          <div className="w-px bg-gray-100 dark:bg-slate-700" />
          <button
            type="button"
            autoFocus
            onClick={() => closeThen(() => { onClose(); onLogin(); })}
            className="flex-1 py-3 text-sm font-bold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
          >
            Hubungkan
          </button>
        </div>
      </div>
    </div>
  );
}
