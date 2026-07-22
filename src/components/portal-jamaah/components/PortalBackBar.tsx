import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';

export default function PortalBackBar({
  title,
  onBack,
  icon: Icon,
  iconClassName,
  rightSlot,
}: {
  title: string;
  onBack: () => void;
  icon?: LucideIcon;
  iconClassName?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 shadow-sm shadow-slate-900/5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/70 dark:shadow-black/20">
      <div className="mx-auto grid w-full max-w-lg grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gray-100/80 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-left">
          {Icon && (
            <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${iconClassName || 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
          )}
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{title}</p>
        </div>
        <div className="flex h-9 w-9 flex-none items-center justify-center justify-self-end">{rightSlot ?? null}</div>
      </div>
    </header>
  );
}
