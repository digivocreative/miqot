import type { LucideIcon } from 'lucide-react';
import { AlarmClock, BookOpenCheck, CheckCircle, CreditCard, FileText, Package } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';
import type { PortalJamaah, PortalMeData } from '../hooks/usePortalMe';
import type { PortalPersiapanData, PortalPersiapanItem } from '../hooks/usePortalPersiapan';
import { daysUntilDate, formatLongDate, formatPortalTime } from '../utils/formatDate';
import { DOKUMEN_WAJIB, docStatus } from './dokumenChecklist';

/**
 * SATU daftar aksi "Yang Perlu Anda Lakukan" di beranda — hasil lebur
 * SmartAlertsStrip (pengingat urgent dari data booking) + TaskListWidget
 * (checklist persiapan). Kategori yang sudah tampil sebagai urgent tidak
 * diulang lagi sebagai task biasa; total dibatasi MAX_ACTIONS baris.
 *
 * Item tanpa halaman tujuan di portal (perlengkapan) diarahkan ke WhatsApp
 * agent — bukan tombol yang tap-nya tidak melakukan apa-apa.
 */
export type ActionTone = 'red' | 'amber' | 'brand' | 'neutral';
export type ActionCategory = 'pembayaran' | 'dokumen' | 'perlengkapan' | 'manasik' | 'lainnya';

export type ActionTarget =
  | { type: 'route'; route: PortalRoute }
  | { type: 'wa'; message: string }
  | { type: 'none' };

export interface PortalAction {
  id: string;
  title: string;
  subtitle: string;
  tone: ActionTone;
  urgent: boolean;
  category: ActionCategory;
  icon: LucideIcon;
  target: ActionTarget;
}

export const MAX_ACTIONS = 3;

const CRITICAL_DOC_KEYS = new Set(['paspor', 'ktp', 'vaksin', 'foto_46']);

function totalSisa(jamaah: PortalJamaah[]) {
  return jamaah.reduce((sum, item) => sum + Number(item.sisa || 0), 0);
}

function hasMissingCriticalDoc(jamaah: PortalJamaah[]): boolean {
  return jamaah.some((j) =>
    DOKUMEN_WAJIB.some((spec) => CRITICAL_DOC_KEYS.has(spec.key) && docStatus(j, spec) === 'belum')
  );
}

function hasUntakenEquipment(jamaah: PortalJamaah[]): boolean {
  return jamaah.some((j) => Object.values(j.perlengkapan || {}).some((p) => p?.status !== 'diambil'));
}

function waTarget(data: PortalMeData, topic: string): ActionTarget {
  if (!data.agent?.phone) return { type: 'none' };
  const initiator = data.jamaah.find((j) => j.is_initiator) || data.jamaah[0];
  const message = `Assalamualaikum ${data.agent?.name || 'Agent'}, saya ${initiator?.nama || 'jamaah'} dari booking ${data.booking.id_umroh}. ${topic}`;
  return { type: 'wa', message };
}

function deriveUrgentActions(data: PortalMeData, daysLeft: number): PortalAction[] {
  const actions: PortalAction[] = [];
  const sisa = totalSisa(data.jamaah);

  if (daysLeft <= 30 && sisa > 0) {
    actions.push({
      id: 'payment-overdue',
      title: 'Pembayaran belum lunas',
      subtitle: `H-${daysLeft} ke keberangkatan, sisa belum lunas`,
      tone: 'red',
      urgent: true,
      category: 'pembayaran',
      icon: AlarmClock,
      target: { type: 'route', route: 'pembayaran' },
    });
  }

  if (daysLeft <= 60 && hasMissingCriticalDoc(data.jamaah)) {
    actions.push({
      id: 'doc-incomplete',
      title: 'Dokumen belum lengkap',
      subtitle: 'Lengkapi paspor, KTP, vaksin, atau foto',
      tone: 'amber',
      urgent: true,
      category: 'dokumen',
      icon: FileText,
      target: { type: 'route', route: 'dokumen' },
    });
  }

  if (daysLeft <= 14 && hasUntakenEquipment(data.jamaah)) {
    actions.push({
      id: 'equipment-untaken',
      title: 'Perlengkapan belum diambil',
      subtitle: 'Chat agent untuk ambil koper & ihram',
      tone: 'brand',
      urgent: true,
      category: 'perlengkapan',
      icon: Package,
      target: waTarget(data, 'Saya ingin bertanya tentang pengambilan perlengkapan (koper, ihram, dll).'),
    });
  }

  if (data.schedule?.manasik_tgl) {
    const manasikDaysLeft = daysUntilDate(data.schedule.manasik_tgl);
    if (manasikDaysLeft !== null && manasikDaysLeft <= 7 && manasikDaysLeft >= 0) {
      const jam = data.schedule.manasik_jam ? ` · ${formatPortalTime(data.schedule.manasik_jam)}` : '';
      actions.push({
        id: 'manasik-soon',
        title: manasikDaysLeft === 0 ? 'Manasik hari ini' : `Manasik ${manasikDaysLeft} hari lagi`,
        subtitle: `${formatLongDate(data.schedule.manasik_tgl)}${jam}`,
        tone: 'brand',
        urgent: true,
        category: 'manasik',
        icon: BookOpenCheck,
        target: { type: 'route', route: 'itinerary' },
      });
    }
  }

  return actions;
}

function categoryFor(item: PortalPersiapanItem): ActionCategory {
  const haystack = `${item.id?.toLowerCase() || ''} ${item.title?.toLowerCase() || ''}`;
  if (/bayar|pembayaran|lunas/.test(haystack)) return 'pembayaran';
  if (/dokumen|paspor|visa|vaksin|foto/.test(haystack)) return 'dokumen';
  if (/perlengkapan|koper|ihram|mukena/.test(haystack)) return 'perlengkapan';
  if (/manasik|spiritual|doa|niat|hafalan/.test(haystack)) return 'manasik';
  return 'lainnya';
}

const CATEGORY_ICON: Record<ActionCategory, LucideIcon> = {
  pembayaran: CreditCard,
  dokumen: FileText,
  perlengkapan: Package,
  manasik: BookOpenCheck,
  lainnya: CheckCircle,
};

function taskTarget(data: PortalMeData, category: ActionCategory): ActionTarget {
  switch (category) {
    case 'pembayaran':
      return { type: 'route', route: 'pembayaran' };
    case 'dokumen':
      return { type: 'route', route: 'dokumen' };
    // Jadwal manasik kini punya rumah permanen di halaman Itinerary.
    case 'manasik':
      return { type: 'route', route: 'itinerary' };
    case 'perlengkapan':
      return waTarget(data, 'Saya ingin bertanya tentang pengambilan perlengkapan (koper, ihram, dll).');
    default:
      return { type: 'none' };
  }
}

// Jendela relevansi task persiapan (hari menuju berangkat). Jauh sebelum itu,
// beranda dibiarkan tenang — checklist lengkap tetap tersedia lewat data persiapan.
const TASK_PHASE_WINDOW: Record<string, number> = {
  sekarang: 60,
  h30: 30,
  h7: 7,
  h1: 1,
};

function derivePersiapanActions(
  data: PortalMeData,
  persiapan: PortalPersiapanData | null,
  daysLeft: number,
): PortalAction[] {
  if (!persiapan?.tahapan) return [];
  return persiapan.tahapan
    .filter((item) => !item.checked)
    .filter((item) => daysLeft <= (TASK_PHASE_WINDOW[item.phase || 'sekarang'] ?? TASK_PHASE_WINDOW.sekarang))
    .map((item) => {
      const category = categoryFor(item);
      return {
        id: item.id,
        title: item.title,
        subtitle: item.description || 'Persiapan keberangkatan',
        tone: 'neutral' as ActionTone,
        urgent: false,
        category,
        icon: CATEGORY_ICON[category],
        target: taskTarget(data, category),
      };
    });
}

export function deriveActions(data: PortalMeData, persiapan: PortalPersiapanData | null): PortalAction[] {
  const daysLeft = Number(data.booking.hari_ke_berangkat ?? daysUntilDate(data.booking.tgl_berangkat) ?? 999);
  const urgent = deriveUrgentActions(data, daysLeft);
  const usedCategories = new Set(urgent.map((action) => action.category));
  const tasks = derivePersiapanActions(data, persiapan, daysLeft).filter((action) => !usedCategories.has(action.category));
  return [...urgent, ...tasks].slice(0, MAX_ACTIONS);
}
