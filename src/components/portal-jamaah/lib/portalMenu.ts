import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, CreditCard, FileText, LifeBuoy, Package, Plane } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';

export interface PortalMenu {
  id: Exclude<PortalRoute, 'beranda'>;
  label: string;
  desc: string;
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
  iconRing: string;
  cardBg: string;
  cardBorder: string;
  blob: string;
}

export const PORTAL_MENUS: PortalMenu[] = [
  {
    id: 'perjalanan',
    label: 'Perjalanan',
    desc: 'Flight & hotel',
    icon: Plane,
    iconBg: 'bg-emerald-100/80 dark:bg-emerald-900/30',
    iconText: 'text-emerald-700 dark:text-emerald-300',
    iconRing: 'ring-emerald-200/70 dark:ring-emerald-700/50',
    cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    cardBorder: 'border-emerald-100/80 dark:border-emerald-800/40',
    blob: 'bg-emerald-300 dark:bg-emerald-500',
  },
  {
    id: 'pembayaran',
    label: 'Pembayaran',
    desc: 'Cicilan & bukti',
    icon: CreditCard,
    iconBg: 'bg-amber-100/80 dark:bg-amber-900/30',
    iconText: 'text-amber-700 dark:text-amber-300',
    iconRing: 'ring-amber-200/70 dark:ring-amber-700/50',
    cardBg: 'bg-amber-50/70 dark:bg-amber-950/30',
    cardBorder: 'border-amber-100/80 dark:border-amber-800/40',
    blob: 'bg-amber-300 dark:bg-amber-500',
  },
  {
    id: 'dokumen',
    label: 'Dokumen',
    desc: 'Paspor, KTP, vaksin',
    icon: FileText,
    iconBg: 'bg-blue-100/80 dark:bg-blue-900/30',
    iconText: 'text-blue-700 dark:text-blue-300',
    iconRing: 'ring-blue-200/70 dark:ring-blue-700/50',
    cardBg: 'bg-blue-50/70 dark:bg-blue-950/30',
    cardBorder: 'border-blue-100/80 dark:border-blue-800/40',
    blob: 'bg-blue-300 dark:bg-blue-500',
  },
  {
    id: 'perlengkapan',
    label: 'Perlengkapan',
    desc: 'Koper, ihram, dll',
    icon: Package,
    iconBg: 'bg-violet-100/80 dark:bg-violet-900/30',
    iconText: 'text-violet-700 dark:text-violet-300',
    iconRing: 'ring-violet-200/70 dark:ring-violet-700/50',
    cardBg: 'bg-violet-50/70 dark:bg-violet-950/30',
    cardBorder: 'border-violet-100/80 dark:border-violet-800/40',
    blob: 'bg-violet-300 dark:bg-violet-500',
  },
  {
    id: 'manasik',
    label: 'Manasik',
    desc: 'Jadwal & spiritual',
    icon: BookOpenCheck,
    iconBg: 'bg-purple-100/80 dark:bg-purple-900/30',
    iconText: 'text-purple-700 dark:text-purple-300',
    iconRing: 'ring-purple-200/70 dark:ring-purple-700/50',
    cardBg: 'bg-purple-50/70 dark:bg-purple-950/30',
    cardBorder: 'border-purple-100/80 dark:border-purple-800/40',
    blob: 'bg-purple-300 dark:bg-purple-500',
  },
  {
    id: 'faq',
    label: 'FAQ',
    desc: 'Pertanyaan umum',
    icon: LifeBuoy,
    iconBg: 'bg-pink-100/80 dark:bg-pink-900/30',
    iconText: 'text-pink-700 dark:text-pink-300',
    iconRing: 'ring-pink-200/70 dark:ring-pink-700/50',
    cardBg: 'bg-pink-50/70 dark:bg-pink-950/30',
    cardBorder: 'border-pink-100/80 dark:border-pink-800/40',
    blob: 'bg-pink-300 dark:bg-pink-500',
  },
];
