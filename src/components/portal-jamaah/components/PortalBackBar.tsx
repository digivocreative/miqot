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
      <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gray-100/80 text-gray-700 shadow-sm shadow-slate-900/5 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-200 dark:shadow-black/20 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 dark:text-white">{title}</p>
        <div className="flex flex-none items-center justify-center">{rightSlot ?? <ThemeToggle />}</div>
      </div>
    </header>
  );
}
