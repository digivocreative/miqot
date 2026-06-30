import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

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
      <div className="mx-auto grid w-full max-w-lg grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-white/60 bg-white/10 text-slate-700 shadow-sm shadow-slate-900/5 transition-colors hover:bg-white/50 active:scale-95 dark:border-white/10 dark:text-slate-200 dark:shadow-black/20 dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Halaman</p>
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{title}</p>
        </div>
        <div className="flex h-11 w-11 flex-none items-center justify-center justify-self-end">{rightSlot ?? <ThemeToggle />}</div>
      </div>
    </header>
  );
}
