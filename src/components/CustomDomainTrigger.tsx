import { Globe, Clock, Check, ArrowRight } from 'lucide-react';
import type { CustomDomainConfig } from '../types/customDomain';

interface Props {
  config: CustomDomainConfig | null;
  loading: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function CustomDomainTrigger({ config, loading, onClick, disabled = false }: Props) {
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="w-full text-left bg-gray-50 dark:bg-slate-800/70 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 opacity-75 cursor-not-allowed"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
            <Globe size={14} className="text-gray-400 dark:text-slate-500" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-300 truncate">
              Custom Domain
            </p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">
              Belum tersedia untuk akun ini.
            </p>
          </div>
          <span className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-slate-500">
            Nonaktif
          </span>
        </div>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-gray-100 dark:bg-slate-700 animate-pulse rounded" />
            <div className="h-2.5 w-48 bg-gray-100 dark:bg-slate-700 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  const status = config?.status;

  // Empty state — call to action
  if (!status) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 hover:border-emerald-200 dark:hover:border-emerald-800/40 transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
            <Globe size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
              Custom Domain
            </p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
              Pakai domain Anda sendiri.
            </p>
          </div>
          <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
            Setup
            <ArrowRight size={12} strokeWidth={2.5} />
          </span>
        </div>
      </button>
    );
  }

  // Pending state — DNS verification in progress
  if (status === 'pending') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 hover:border-amber-200 dark:hover:border-amber-800/40 transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
            <Clock size={14} className="text-amber-600 dark:text-amber-400" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
              {config?.domain}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
              Menunggu DNS · auto-refresh tiap 30 detik
            </p>
          </div>
          <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Cek
            <ArrowRight size={12} strokeWidth={2.5} />
          </span>
        </div>
      </button>
    );
  }

  // Active state — domain verified and serving traffic
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 hover:border-emerald-200 dark:hover:border-emerald-800/40 transition-all active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
          <Check size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
              {config?.domain}
            </p>
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 shrink-0">
              Aktif
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
            SSL aktif (Let's Encrypt)
          </p>
        </div>
        <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          Atur
          <ArrowRight size={12} strokeWidth={2.5} />
        </span>
      </div>
    </button>
  );
}
