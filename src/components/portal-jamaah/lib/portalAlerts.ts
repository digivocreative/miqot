import type { LucideIcon } from 'lucide-react';
import { AlarmClock, BookOpenCheck, FileText, Package } from 'lucide-react';
import type { PortalRoute } from '../hooks/usePortalRoute';
import type { PortalJamaah, PortalMeData } from '../hooks/usePortalMe';
import { daysUntilDate } from '../utils/formatDate';

export type AlertTone = 'red' | 'amber' | 'violet' | 'purple';

export interface PortalAlert {
  id: string;
  title: string;
  subtitle: string;
  tone: AlertTone;
  icon: LucideIcon;
  navigateTo: PortalRoute;
}

const CRITICAL_DOC_GROUPS = [
  { keys: ['paspor'], hasValue: (jamaah: PortalJamaah) => Boolean(jamaah.no_paspor) },
  { keys: ['ktp'] },
  { keys: ['vaksin', 'meningitis'] },
  { keys: ['foto_46', 'foto', 'pas_foto'] },
];

function totalSisa(jamaah: PortalJamaah[]) {
  return jamaah.reduce((sum, item) => sum + Number(item.sisa || 0), 0);
}

function hasMissingCriticalDoc(jamaah: PortalJamaah[]): boolean {
  return jamaah.some((j) => {
    const text = JSON.stringify(j.dokumen || {}).toLowerCase();
    return CRITICAL_DOC_GROUPS.some((group) => {
      const markedPending = group.keys.some((key) => text.includes(`${key}_belum_siap`));
      const hasDocument = group.hasValue?.(j) || group.keys.some((key) => text.includes(key));
      return markedPending || !hasDocument;
    });
  });
}

function hasUntakenEquipment(jamaah: PortalJamaah[]): boolean {
  return jamaah.some((j) => Object.values(j.perlengkapan || {}).some((p) => p?.status !== 'diambil'));
}

export function deriveAlerts(data: PortalMeData): PortalAlert[] {
  const alerts: PortalAlert[] = [];
  const daysLeft = Number(data.booking.hari_ke_berangkat ?? daysUntilDate(data.booking.tgl_berangkat) ?? 999);
  const sisa = totalSisa(data.jamaah);

  if (daysLeft <= 30 && sisa > 0) {
    alerts.push({
      id: 'payment-overdue',
      title: 'Pembayaran belum lunas',
      subtitle: `H-${daysLeft} ke keberangkatan, sisa belum lunas`,
      tone: 'red',
      icon: AlarmClock,
      navigateTo: 'pembayaran',
    });
  }

  if (daysLeft <= 60 && hasMissingCriticalDoc(data.jamaah)) {
    alerts.push({
      id: 'doc-incomplete',
      title: 'Dokumen belum lengkap',
      subtitle: 'Lengkapi paspor, KTP, vaksin, atau foto',
      tone: 'amber',
      icon: FileText,
      navigateTo: 'dokumen',
    });
  }

  if (daysLeft <= 14 && hasUntakenEquipment(data.jamaah)) {
    alerts.push({
      id: 'equipment-untaken',
      title: 'Perlengkapan belum diambil',
      subtitle: 'Hubungi agent untuk ambil koper & ihram',
      tone: 'violet',
      icon: Package,
      navigateTo: 'perlengkapan',
    });
  }

  if (data.schedule?.manasik_tgl) {
    const manasikDaysLeft = daysUntilDate(data.schedule.manasik_tgl);
    if (manasikDaysLeft !== null && manasikDaysLeft <= 7 && manasikDaysLeft >= 0) {
      alerts.push({
        id: 'manasik-soon',
        title: 'Manasik dalam 7 hari',
        subtitle: `Jadwal manasik H-${manasikDaysLeft}`,
        tone: 'purple',
        icon: BookOpenCheck,
        navigateTo: 'manasik',
      });
    }
  }

  return alerts.slice(0, 2);
}
