import { Backpack, BadgeCheck, BookOpen, Briefcase, Check, Circle, IdCard, Shirt, WalletCards } from 'lucide-react';
import type { PortalPerlengkapanStateItem } from '../../hooks/usePortalPersiapan';

const ICONS: Record<string, typeof Briefcase> = {
  briefcase: Briefcase,
  backpack: Backpack,
  wallet: WalletCards,
  shirt: Shirt,
  book: BookOpen,
  'id-card': IdCard,
  belt: Circle,
};

function statusClasses(status: PortalPerlengkapanStateItem['status']) {
  if (status === 'diambil') return { box: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
  if (status === 'tersedia') return { box: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
  return { box: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-300', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' };
}

export default function PerlengkapanItem({
  item,
  subtext,
}: {
  item: PortalPerlengkapanStateItem;
  subtext: string;
}) {
  const Icon = ICONS[item.icon] || BadgeCheck;
  const classes = statusClasses(item.status);

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-800 ${item.status === 'tersedia' ? 'border-amber-100 dark:border-amber-800/40' : 'border-slate-100 dark:border-slate-700'}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${classes.box}`}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-slate-950 dark:text-white">{item.title}</p>
            {item.status === 'diambil' ? (
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <Check className="h-4 w-4" strokeWidth={2.4} />
              </span>
            ) : (
              <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes.badge}`}>
                Menunggu
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{subtext}</p>
        </div>
      </div>
    </div>
  );
}
