// Kartu menu Bani — dirender di baris Teras pada grid dashboard
// (DashboardLayout), membuka halaman /dashboard/bani. Bahasa visualnya
// mengikuti TerasCard: baris ikon+nama+chevron di atas, teks sekunder di bawah.
import { ChevronRight } from 'lucide-react';
import BaniAvatar from './BaniAvatar';

export default function BaniMenuCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Buka Bani, asisten AI"
      className="group flex min-h-[88px] w-full flex-col rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-indigo-100/70 p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-blue-800/40 dark:from-blue-950/40 dark:via-slate-800 dark:to-slate-800 dark:focus-visible:ring-offset-slate-950"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative shrink-0">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl shadow-lg shadow-blue-500/30 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 dark:shadow-blue-900/40">
            <BaniAvatar className="h-full w-full" />
          </span>
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 dark:border-slate-800" />
        </span>
        <span className="text-sm font-extrabold text-gray-900 dark:text-white">Bani</span>
        <span className="flex-1" />
        <ChevronRight size={16} className="shrink-0 text-gray-400 dark:text-slate-500" />
      </div>
      <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-gray-500 dark:text-slate-400">
        Asisten AI · tanya paket & jamaah
      </p>
    </button>
  );
}
