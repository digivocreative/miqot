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
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/90">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gray-100/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] text-gray-500 dark:text-slate-400">Halaman</p>
          <p className="truncate text-sm font-bold text-gray-800 dark:text-white">{title}</p>
        </div>
        <div className="flex h-9 w-9 flex-none items-center justify-center">{rightSlot}</div>
      </div>
    </header>
  );
}
