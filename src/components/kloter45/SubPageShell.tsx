import type { ComponentType, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import Kloter45ThemeToggle from '@/components/kloter45/ThemeToggle';
import { KLOTER45_PUBLIC_PATH } from '@/lib/kloter45Landing.js';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

// Kerangka sub-halaman: bar atas (kembali + judul + tema) dan isi selebar
// kolom yang sama dengan halaman utama, supaya perpindahannya terasa satu app.
export default function Kloter45SubPageShell({
  title,
  icon: Icon,
  onBack,
  flush = false,
  children,
}: {
  title: string;
  icon: IconComponent;
  onBack: () => void;
  /** Isi menempel tepi layar di HP (tanpa px-4/pt-4) — untuk konten yang sudah
   *  membawa inset sendiri, mis. WebItineraryView (mx-3 per kartu hari). */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 font-sans text-gray-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          <a
            href={KLOTER45_PUBLIC_PATH}
            data-kloter45-back
            onClick={(event) => {
              event.preventDefault();
              onBack();
            }}
            aria-label="Kembali ke daftar jamaah"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gray-100/80 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ArrowLeft size={16} strokeWidth={2.4} />
          </a>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300">
              <Icon size={16} strokeWidth={2.4} />
            </span>
            <h1 className="truncate text-sm font-bold text-gray-900 dark:text-slate-100">{title}</h1>
          </div>
          <Kloter45ThemeToggle />
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-lg space-y-3 ${
          flush ? 'sm:px-4 sm:pb-10 sm:pt-4' : 'px-4 pb-10 pt-4'
        }`}
      >
        {children}
      </main>
    </div>
  );
}
