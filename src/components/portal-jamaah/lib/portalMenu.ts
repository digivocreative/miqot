import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, CreditCard, FileText, LifeBuoy, Package, Plane } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';

export interface PortalMenu {
  id: Exclude<PortalRoute, 'beranda'>;
  label: string;
  desc: string;
  icon: LucideIcon;
  iconBg: string;
  cardBg: string;
  cardBorder: string;
  iconShadow: string;
}

export const PORTAL_MENUS: PortalMenu[] = [
  {
    id: 'perjalanan',
    label: 'Perjalanan',
    desc: 'Flight & hotel',
    icon: Plane,
    iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-600 dark:from-emerald-500 dark:to-teal-700',
    cardBg: 'bg-gradient-to-br from-emerald-50 via-white to-teal-100/70 dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-emerald-200/70 dark:border-emerald-800/40',
    iconShadow: 'shadow-lg shadow-emerald-500/30 dark:shadow-emerald-900/40',
  },
  {
    id: 'pembayaran',
    label: 'Pembayaran',
    desc: 'Cicilan & bukti',
    icon: CreditCard,
    iconBg: 'bg-gradient-to-br from-sky-400 to-indigo-600 dark:from-sky-500 dark:to-indigo-700',
    cardBg: 'bg-gradient-to-br from-sky-50 via-white to-indigo-100/70 dark:from-sky-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-sky-200/70 dark:border-sky-800/40',
    iconShadow: 'shadow-lg shadow-sky-500/30 dark:shadow-sky-900/40',
  },
  {
    id: 'dokumen',
    label: 'Dokumen',
    desc: 'Paspor, visa, dll',
    icon: FileText,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500 dark:from-amber-500 dark:to-orange-600',
    cardBg: 'bg-gradient-to-br from-amber-50 via-white to-orange-100/70 dark:from-amber-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-amber-200/70 dark:border-amber-800/40',
    iconShadow: 'shadow-lg shadow-amber-500/30 dark:shadow-amber-900/40',
  },
  {
    id: 'perlengkapan',
    label: 'Perlengkapan',
    desc: 'Koper, ihram, dll',
    icon: Package,
    iconBg: 'bg-gradient-to-br from-violet-400 to-purple-600 dark:from-violet-500 dark:to-purple-700',
    cardBg: 'bg-gradient-to-br from-violet-50 via-white to-purple-100/70 dark:from-violet-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-violet-200/70 dark:border-violet-800/40',
    iconShadow: 'shadow-lg shadow-violet-500/30 dark:shadow-violet-900/40',
  },
  {
    id: 'manasik',
    label: 'Manasik',
    desc: 'Jadwal & spiritual',
    icon: BookOpenCheck,
    iconBg: 'bg-gradient-to-br from-purple-400 to-fuchsia-600 dark:from-purple-500 dark:to-fuchsia-700',
    cardBg: 'bg-gradient-to-br from-fuchsia-50 via-white to-purple-100/70 dark:from-purple-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-purple-200/70 dark:border-purple-800/40',
    iconShadow: 'shadow-lg shadow-purple-500/30 dark:shadow-purple-900/40',
  },
  {
    id: 'faq',
    label: 'FAQ',
    desc: 'Pertanyaan umum',
    icon: LifeBuoy,
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600 dark:from-rose-500 dark:to-pink-700',
    cardBg: 'bg-gradient-to-br from-rose-50 via-white to-pink-100/70 dark:from-rose-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-rose-200/70 dark:border-rose-800/40',
    iconShadow: 'shadow-lg shadow-rose-500/30 dark:shadow-rose-900/40',
  },
];
