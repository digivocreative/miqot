import { useState } from 'react';
import { Info, LogOut, MoreVertical, UserRound } from 'lucide-react';

export default function LogoutMenu({ onLogout }: { onLogout: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200"
        aria-label="Menu portal"
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-left shadow-lg">
          <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-gray-500 dark:text-slate-400">
            <UserRound className="h-4 w-4" strokeWidth={2} />
            Profil Booking
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-gray-500 dark:text-slate-400">
            <Info className="h-4 w-4" strokeWidth={2} />
            Tentang Portal
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            Keluar
          </button>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 dark:bg-slate-950/50 px-4 pb-5 sm:items-center sm:pb-0">
          <section className="w-full max-w-sm rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-xl">
            <p className="text-base font-bold text-gray-900 dark:text-white">Keluar dari portal?</p>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-slate-400">
              Anda perlu link akses baru atau kode booking untuk masuk lagi di perangkat ini.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-gray-200 dark:border-slate-600 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
              >
                Keluar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
