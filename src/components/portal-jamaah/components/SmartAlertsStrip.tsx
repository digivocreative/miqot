import { ChevronRight } from 'lucide-react';
import { deriveAlerts, type AlertTone, type PortalAlert } from '../lib/portalAlerts';
import type { PortalMeData } from '../hooks/usePortalMe';
import type { PortalRoute } from '../hooks/usePortalRoute';

const TONE_STYLES: Record<AlertTone, { card: string; iconWrap: string; iconColor: string; title: string; sub: string }> = {
  red: {
    card: 'bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800/40',
    iconWrap: 'bg-red-100 dark:bg-red-900/40',
    iconColor: 'text-red-600 dark:text-red-400',
    title: 'text-red-800 dark:text-red-200',
    sub: 'text-red-700 dark:text-red-300',
  },
  amber: {
    card: 'bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/40',
    iconWrap: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-200',
    sub: 'text-amber-700 dark:text-amber-300',
  },
  violet: {
    card: 'bg-violet-50 border-violet-100 dark:bg-violet-900/20 dark:border-violet-800/40',
    iconWrap: 'bg-violet-100 dark:bg-violet-900/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
    title: 'text-violet-800 dark:text-violet-200',
    sub: 'text-violet-700 dark:text-violet-300',
  },
  purple: {
    card: 'bg-purple-50 border-purple-100 dark:bg-purple-900/20 dark:border-purple-800/40',
    iconWrap: 'bg-purple-100 dark:bg-purple-900/40',
    iconColor: 'text-purple-600 dark:text-purple-400',
    title: 'text-purple-800 dark:text-purple-200',
    sub: 'text-purple-700 dark:text-purple-300',
  },
};

function AlertRow({ alert, onNavigate }: { alert: PortalAlert; onNavigate: (r: PortalRoute) => void }) {
  const tone = TONE_STYLES[alert.tone];
  const Icon = alert.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(alert.navigateTo)}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.98] ${tone.card}`}
    >
      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${tone.iconWrap}`}>
        <Icon className={`h-5 w-5 ${tone.iconColor}`} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${tone.title}`}>{alert.title}</p>
        <p className={`text-xs ${tone.sub}`}>{alert.subtitle}</p>
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
