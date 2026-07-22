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
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/70 shadow-soft backdrop-blur-xl backdrop-saturate-150">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-gold opacity-30" />
      <div className="mx-auto grid w-full max-w-lg grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-black/5 text-ink/60 transition-colors hover:bg-black/10 hover:text-ink active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-left">
          {Icon && (
            <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${iconClassName || 'bg-burgundy-700/8 text-burgundy-700'}`}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
          )}
          <p className="truncate text-sm font-bold text-ink">{title}</p>
        </div>
        <div className="flex h-9 w-9 flex-none items-center justify-center justify-self-end">{rightSlot ?? null}</div>
      </div>
    </header>
  );
}
