import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, CreditCard, FileText, LifeBuoy, Package, Plane } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';

export interface PortalMenu {
  id: Exclude<PortalRoute, 'beranda'>;
  label: string;
  desc: string;
  icon: LucideIcon;
  iconBg: string;
  iconShadow: string;
  iconAnim: string;
  cardBg: string;
  cardBorder: string;
  hoverShadow: string;
}

export const PORTAL_MENUS: PortalMenu[] = [
  {
    id: 'perjalanan',
    label: 'Perjalanan',
    desc: 'Flight & hotel',
    icon: Plane,
    iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-600 dark:from-emerald-500 dark:to-teal-700',
    iconShadow: 'shadow-lg shadow-emerald-500/30 dark:shadow-emerald-900/40',
    iconAnim: 'animate-icon-float',
    cardBg: 'bg-gradient-to-br from-emerald-50 via-white to-teal-100/70 dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-emerald-200/70 dark:border-emerald-800/40',
    hoverShadow: 'hover:shadow-emerald-300/40 dark:hover:shadow-emerald-900/30',
  },
  {
    id: 'pembayaran',
    label: 'Pembayaran',
    desc: 'Cicilan & bukti',
    icon: CreditCard,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500 dark:from-amber-500 dark:to-orange-600',
    iconShadow: 'shadow-lg shadow-amber-500/30 dark:shadow-amber-900/40',
    iconAnim: 'animate-icon-breathe',
    cardBg: 'bg-gradient-to-br from-amber-50 via-white to-orange-100/70 dark:from-amber-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-amber-200/70 dark:border-amber-800/40',
    hoverShadow: 'hover:shadow-amber-300/40 dark:hover:shadow-amber-900/30',
  },
  {
    id: 'dokumen',
    label: 'Dokumen',
    desc: 'Paspor, KTP, vaksin',
    icon: FileText,
    iconBg: 'bg-gradient-to-br from-blue-400 to-cyan-600 dark:from-blue-500 dark:to-cyan-700',
    iconShadow: 'shadow-lg shadow-blue-500/30 dark:shadow-blue-900/40',
    iconAnim: 'animate-icon-rise',
    cardBg: 'bg-gradient-to-br from-blue-50 via-white to-cyan-100/70 dark:from-blue-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-blue-200/70 dark:border-blue-800/40',
    hoverShadow: 'hover:shadow-blue-300/40 dark:hover:shadow-blue-900/30',
  },
  {
    id: 'perlengkapan',
    label: 'Perlengkapan',
    desc: 'Koper, ihram, dll',
    icon: Package,
    iconBg: 'bg-gradient-to-br from-violet-400 to-purple-600 dark:from-violet-500 dark:to-purple-700',
    iconShadow: 'shadow-lg shadow-violet-500/30 dark:shadow-violet-900/40',
    iconAnim: 'animate-icon-float',
    cardBg: 'bg-gradient-to-br from-violet-50 via-white to-purple-100/70 dark:from-violet-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-violet-200/70 dark:border-violet-800/40',
    hoverShadow: 'hover:shadow-violet-300/40 dark:hover:shadow-violet-900/30',
  },
  {
    id: 'manasik',
    label: 'Manasik',
    desc: 'Jadwal & spiritual',
    icon: BookOpenCheck,
    iconBg: 'bg-gradient-to-br from-fuchsia-400 to-purple-600 dark:from-fuchsia-500 dark:to-purple-700',
    iconShadow: 'shadow-lg shadow-purple-500/30 dark:shadow-purple-900/40',
    iconAnim: 'animate-icon-breathe',
    cardBg: 'bg-gradient-to-br from-fuchsia-50 via-white to-purple-100/70 dark:from-purple-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-purple-200/70 dark:border-purple-800/40',
    hoverShadow: 'hover:shadow-purple-300/40 dark:hover:shadow-purple-900/30',
  },
  {
    id: 'faq',
    label: 'FAQ',
    desc: 'Pertanyaan umum',
    icon: LifeBuoy,
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600 dark:from-rose-500 dark:to-pink-700',
    iconShadow: 'shadow-lg shadow-rose-500/30 dark:shadow-rose-900/40',
    iconAnim: 'animate-icon-wiggle',
    cardBg: 'bg-gradient-to-br from-rose-50 via-white to-pink-100/70 dark:from-rose-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-rose-200/70 dark:border-rose-800/40',
    hoverShadow: 'hover:shadow-rose-300/40 dark:hover:shadow-rose-900/30',
  },
];
