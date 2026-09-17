import { useSyncExternalStore } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate, dismissUpdate, getUpdateState, subscribeUpdate } from '../../lib/pwa/updateStore';
import { hasUnsavedChanges } from '../../lib/unsavedChanges';

const UNSAVED_CONFIRM = 'Ada perubahan yang belum disimpan. Muat ulang sekarang dan buang perubahan itu?';

// Tawaran versi baru. Menggantikan reload otomatis tanpa peringatan (yang membuang teks
// yang sedang diketik dan me-reload semua tab sekaligus). Versi baru juga otomatis dipakai
// saat semua jendela app ditutup lalu dibuka lagi.
export default function UpdateToast() {
  const state = useSyncExternalStore(subscribeUpdate, getUpdateState, getUpdateState);
  if (!state.ready || state.dismissed) return null;

  const reload = () => {
    if (hasUnsavedChanges() && !window.confirm(UNSAVED_CONFIRM)) return;
    applyUpdate();
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[10001] flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-gray-200 bg-white py-2 pl-4 pr-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <RefreshCw size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Versi baru tersedia</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">Muat ulang untuk memakai pembaruan.</p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="min-h-[44px] shrink-0 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-95"
        >
          Muat ulang
        </button>
        <button
          type="button"
          onClick={dismissUpdate}
          aria-label="Nanti saja"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
