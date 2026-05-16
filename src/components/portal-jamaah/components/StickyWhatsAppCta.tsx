import { MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import type { PortalAgentInfo, PortalBooking, PortalJamaah } from '../hooks/usePortalMe';

export default function StickyWhatsAppCta({
  agent,
  booking,
  initiator,
}: {
  agent: PortalAgentInfo | null;
  booking: PortalBooking;
  initiator: PortalJamaah | undefined;
}) {
  const phone = normalizeWaNumber(agent?.phone);
  if (!phone) return null;
  const message = `Assalamualaikum ${agent?.name || 'Agent'}, saya ${initiator?.nama || 'jamaah'} dari booking ${booking.id_umroh}. Saya ingin bertanya tentang persiapan perjalanan umroh kami.`;
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-emerald-500 shadow-lg shadow-emerald-500/30 dark:bg-emerald-600">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mx-auto flex w-full max-w-lg items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold text-white"
        style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
      >
        <MessageCircle className="h-5 w-5" strokeWidth={2} />
        <span>Hubungi {agent?.name || 'Agent'} lewat WhatsApp</span>
      </a>
    </div>
  );
}
