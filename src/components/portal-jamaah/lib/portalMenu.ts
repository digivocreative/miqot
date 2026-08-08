import type { LucideIcon } from 'lucide-react';
import { BookOpen, CreditCard, FileText, HandHeart, LifeBuoy, Map } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';

/**
 * Menu variant — the ONE brand system. `brand` = soft burgundy IconTile
 * (default); `premium` = the single reserved gold treatment (Al-Quran, the
 * spiritual centerpiece). Surface + hover chrome live in PortalMenuGrid /
 * PortalMenuCard; the data carries only icon + per-cell motion + this
 * discriminator.
 */
export type PortalMenuVariant = 'brand' | 'premium';

export interface PortalMenu {
  id: Exclude<PortalRoute, 'beranda'>;
  label: string;
  desc: string;
  icon: LucideIcon;
  iconAnim: string;
  variant: PortalMenuVariant;
}

export const PORTAL_MENUS: PortalMenu[] = [
  {
    id: 'itinerary',
    label: 'Itinerary',
    desc: 'Rencana harian, flight & hotel',
    icon: Map,
    iconAnim: 'motion-safe:animate-icon-float',
    variant: 'brand',
  },
  {
    id: 'pembayaran',
    label: 'Pembayaran',
    desc: 'Cicilan & bukti',
    icon: CreditCard,
    iconAnim: 'motion-safe:animate-icon-breathe',
    variant: 'brand',
  },
  {
    id: 'dokumen',
    label: 'Dokumen',
    desc: 'Paspor, KTP, vaksin',
    icon: FileText,
    iconAnim: 'motion-safe:animate-icon-rise',
    variant: 'brand',
  },
  {
    id: 'al-quran',
    label: 'Al-Quran',
    desc: '114 surah + terjemah',
    icon: BookOpen,
    iconAnim: 'motion-safe:animate-icon-float',
    variant: 'premium',
  },
  {
    id: 'doa-dzikir',
    label: 'Doa & Dzikir',
    desc: 'Doa perjalanan ibadah',
    icon: HandHeart,
    iconAnim: 'motion-safe:animate-icon-breathe',
    variant: 'brand',
  },
  {
    id: 'faq',
    label: 'FAQ',
    desc: 'Pertanyaan umum',
    icon: LifeBuoy,
    iconAnim: 'motion-safe:animate-icon-wiggle',
    variant: 'brand',
  },
];
