import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, CheckCircle, CreditCard, FileText, Package } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';
import type { PortalPersiapanData, PortalPersiapanItem } from '../hooks/usePortalPersiapan';

export type TaskCategory = 'pembayaran' | 'dokumen' | 'perlengkapan' | 'manasik' | 'fallback';

export interface PortalTask {
  id: string;
  title: string;
  subtitle: string;
  category: TaskCategory;
  icon: LucideIcon;
  navigateTo: PortalRoute;
}

function categoryFor(item: PortalPersiapanItem): TaskCategory {
  const id = item.id?.toLowerCase() || '';
  const title = item.title?.toLowerCase() || '';
  const haystack = `${id} ${title}`;
  if (/bayar|pembayaran|lunas/.test(haystack)) return 'pembayaran';
  if (/dokumen|paspor|visa|vaksin|foto/.test(haystack)) return 'dokumen';
  if (/perlengkapan|koper|ihram|mukena/.test(haystack)) return 'perlengkapan';
  if (/manasik|spiritual|doa|niat|hafalan/.test(haystack)) return 'manasik';
  return 'fallback';
}

const ICON_MAP: Record<TaskCategory, LucideIcon> = {
  pembayaran: CreditCard,
  dokumen: FileText,
  perlengkapan: Package,
  manasik: BookOpenCheck,
  fallback: CheckCircle,
};

const ROUTE_MAP: Record<TaskCategory, PortalRoute> = {
  pembayaran: 'pembayaran',
  dokumen: 'dokumen',
  // Halaman Perlengkapan & Manasik dihapus — tugas kategori ini kembali ke beranda.
  perlengkapan: 'beranda',
  manasik: 'beranda',
  fallback: 'beranda',
};

export function deriveTopTasks(persiapan: PortalPersiapanData | null): PortalTask[] {
  if (!persiapan?.tahapan) return [];
  return persiapan.tahapan
    .filter((item) => !item.checked)
    .slice(0, 3)
    .map((item) => {
      const category = categoryFor(item);
      return {
        id: item.id,
        title: item.title,
        subtitle: item.description || 'Persiapan keberangkatan',
        category,
        icon: ICON_MAP[category],
        navigateTo: ROUTE_MAP[category],
      };
    });
}
