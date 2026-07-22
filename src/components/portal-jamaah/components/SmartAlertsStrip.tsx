import { ChevronRight } from 'lucide-react';
import { deriveAlerts, type AlertTone, type PortalAlert } from '../lib/portalAlerts';
import type { PortalMeData } from '../hooks/usePortalMe';
import type { PortalRoute } from '../hooks/usePortalRoute';

// Alert tones route through the StatusChip / token vocabulary: functional red
// for payment-critical, amber for document/deadline, and the off-brand
// violet/purple category hues collapse to soft-burgundy `brand` (the glyph, not
// the color, differentiates equipment vs. manasik).
const TONE_STYLES: Record<AlertTone, { card: string; iconWrap: string; iconColor: string; title: string; sub: string }> = {
  red: {
    card: 'bg-red-50 border-red-100',
    iconWrap: 'bg-red-100',
    iconColor: 'text-red-600',
    title: 'text-red-800',
    sub: 'text-red-700',
  },
  amber: {
    card: 'bg-amber-50 border-amber-100',
    iconWrap: 'bg-amber-100',
    iconColor: 'text-amber-700',
    title: 'text-amber-800',
    sub: 'text-amber-700',
  },
  violet: {
    card: 'bg-burgundy-50 border-burgundy-100',
    iconWrap: 'bg-burgundy-700/10',
    iconColor: 'text-burgundy-700',
    title: 'text-burgundy-900',
    sub: 'text-burgundy-800',
  },
  purple: {
    card: 'bg-burgundy-50 border-burgundy-100',
    iconWrap: 'bg-burgundy-700/10',
    iconColor: 'text-burgundy-700',
    title: 'text-burgundy-900',
    sub: 'text-burgundy-800',
  },
};

function AlertRow({ alert, onNavigate }: { alert: PortalAlert; onNavigate: (r: PortalRoute) => void }) {
  const tone = TONE_STYLES[alert.tone];
  const Icon = alert.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(alert.navigateTo)}
      className={`flex w-full items-center gap-3 rounded-lega border p-3.5 text-left transition-all duration-200 active:scale-[0.98] ${tone.card}`}
    >
      <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${tone.iconWrap}`}>
        <Icon className={`h-5 w-5 ${tone.iconColor}`} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm font-bold leading-5 ${tone.title}`}>{alert.title}</p>
        <p className={`mt-0.5 break-words text-xs leading-5 ${tone.sub}`}>{alert.subtitle}</p>
      </div>
      <ChevronRight className={`h-[18px] w-[18px] flex-none ${tone.iconColor}`} strokeWidth={2} />
    </button>
  );
}

export default function SmartAlertsStrip({
  data,
  onNavigate,
}: {
  data: PortalMeData;
  onNavigate: (route: PortalRoute) => void;
}) {
  const alerts = deriveAlerts(data);
  if (!alerts.length) return null;
  return (
    <div className="space-y-2.5">
      {alerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
