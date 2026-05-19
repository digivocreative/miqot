import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export default function PortalBackBar({
  title,
  onBack,
  rightSlot,
}: {
  title: string;
  onBack: () => void;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 shadow-sm shadow-slate-900/5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/70 dark:shadow-black/20">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-white/60 bg-white/55 text-gray-500 shadow-sm shadow-slate-900/5 backdrop-blur-md transition-colors hover:bg-white/80 active:scale-95 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-white/15"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] text-gray-500 dark:text-slate-400">Halaman</p>
          <p className="truncate text-sm font-bold text-gray-800 dark:text-white">{title}</p>
        </div>
        <div className="flex h-11 w-11 flex-none items-center justify-center">{rightSlot}</div>
      </div>
    </header>
  );
}
