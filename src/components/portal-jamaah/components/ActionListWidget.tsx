import { ChevronRight, MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import { trackPublicEvent } from '@/utils/analytics';
import { deriveActions, type ActionTone, type PortalAction } from '../lib/portalActions';
import type { PortalMeData } from '../hooks/usePortalMe';
import type { PortalPersiapanData } from '../hooks/usePortalPersiapan';
import type { PortalRoute } from '../hooks/usePortalRoute';
import { SectionLabel } from '../ui';

// Satu daftar aksi menggantikan SmartAlertsStrip + TaskListWidget: item urgent
// tampil bernuansa (red/amber/brand), task persiapan biasa tampil netral.
const TONE_STYLES: Record<ActionTone, { card: string; iconWrap: string; iconColor: string; title: string; sub: string }> = {
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
  brand: {
    card: 'bg-burgundy-50 border-burgundy-100',
    iconWrap: 'bg-burgundy-700/10',
    iconColor: 'text-burgundy-700',
    title: 'text-burgundy-900',
    sub: 'text-burgundy-800',
  },
  neutral: {
    card: 'bg-white border-black/5 shadow-soft hover:border-burgundy-700/30 hover:shadow-card',
    iconWrap: 'bg-burgundy-700/8',
    iconColor: 'text-burgundy-700',
    title: 'text-ink',
    sub: 'text-ink/60',
  },
};

function ActionRowBody({ action }: { action: PortalAction }) {
  const tone = TONE_STYLES[action.tone];
  const Icon = action.icon;
  return (
    <>
      <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${tone.iconWrap}`}>
        <Icon className={`h-5 w-5 ${tone.iconColor}`} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm font-bold leading-5 ${tone.title}`}>{action.title}</p>
        <p className={`mt-0.5 break-words text-xs leading-5 ${tone.sub}`}>{action.subtitle}</p>
      </div>
    </>
  );
}

function ActionRow({
  slug,
  action,
  agentPhone,
  onNavigate,
}: {
  slug: string;
  action: PortalAction;
  agentPhone: string;
  onNavigate: (route: PortalRoute) => void;
}) {
  const tone = TONE_STYLES[action.tone];
  const rowClass = `flex w-full items-center gap-3 rounded-lega border p-3.5 text-left transition-all duration-200 ${tone.card}`;

  if (action.target.type === 'route') {
    const { route } = action.target;
    return (
      <button type="button" onClick={() => onNavigate(route)} className={`${rowClass} active:scale-[0.98]`}>
        <ActionRowBody action={action} />
        <ChevronRight className={`h-[18px] w-[18px] flex-none ${tone.iconColor}`} strokeWidth={2} />
      </button>
    );
  }

  if (action.target.type === 'wa' && agentPhone) {
    const waLink = `https://wa.me/${agentPhone}?text=${encodeURIComponent(action.target.message)}`;
    return (
      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackPublicEvent(slug, 'wa_click_portal', { tab: 'beranda', source: 'action' })}
        className={`${rowClass} active:scale-[0.98]`}
      >
        <ActionRowBody action={action} />
        <MessageCircle className={`h-[18px] w-[18px] flex-none ${tone.iconColor}`} strokeWidth={2} />
      </a>
    );
  }

  // Tanpa tujuan (mis. agent tanpa nomor WA): kartu info murni, tanpa affordance tap.
  return (
    <div className={rowClass}>
      <ActionRowBody action={action} />
    </div>
  );
}

export default function ActionListWidget({
  slug,
  data,
  persiapan,
  onNavigate,
}: {
  slug: string;
  data: PortalMeData;
  persiapan: PortalPersiapanData | null;
  onNavigate: (route: PortalRoute) => void;
}) {
  const actions = deriveActions(data, persiapan);
  const agentPhone = normalizeWaNumber(data.agent?.phone) || '';

  // Tidak ada yang perlu dilakukan → seksi tidak dirender sama sekali.
  // (Feedback 2026-08-08: beranda dibiarkan tenang, tanpa kartu perayaan.)
  if (!actions.length) return null;

  return (
    <section className="space-y-3">
      <SectionLabel as="h2">Yang Perlu Anda Lakukan</SectionLabel>
      <div className="space-y-2">
        {actions.map((action) => (
          <ActionRow key={action.id} slug={slug} action={action} agentPhone={agentPhone} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}
