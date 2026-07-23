import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { handleAgentPhotoError } from '@/lib/agent-photo';
import { normalizeWaNumber } from '@/utils/phone';
import { trackPublicEvent } from '@/utils/analytics';
import type { PortalAgentInfo, PortalBooking, PortalJamaah } from '../hooks/usePortalMe';

const SHOW_AFTER_SCROLL_Y = 160;

function initials(name?: string | null) {
  return (name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';
}

export default function StickyWhatsAppCta({
  slug,
  tab,
  agent,
  booking,
  initiator,
}: {
  slug: string;
  tab?: string;
  agent: PortalAgentInfo | null;
  booking: PortalBooking;
  initiator: PortalJamaah | undefined;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const lastScrollY = useRef(0);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    if (currentScrollY <= SHOW_AFTER_SCROLL_Y) {
      setIsVisible(false);
    } else if (currentScrollY > lastScrollY.current) {
      setIsVisible(false);
    } else {
      setIsVisible(true);
    }
    lastScrollY.current = currentScrollY;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const phone = normalizeWaNumber(agent?.phone);
  if (!phone) return null;

  const message = `Assalamualaikum ${agent?.name || 'Agent'}, saya ${initiator?.nama || 'jamaah'} dari booking ${booking.id_umroh}. Saya ingin bertanya tentang persiapan perjalanan umroh kami.`;
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  return (
    <div
      className={`
        fixed left-4 right-4 z-40
        mx-auto max-w-lg
        bg-gradient-to-r from-burgundy-50 via-white to-white
        backdrop-blur-md
        border border-burgundy-700/10
        shadow-card
        rounded-full
        flex items-center justify-between
        p-2 pl-3
        transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-24 opacity-0'}
      `}
      style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
        <div className="w-10 h-10 flex-shrink-0">
          {agent?.photo ? (
            <img
              src={agent.photo}
              alt={agent.name}
              className="w-full h-full object-cover rounded-full border-2 border-white shadow-sm"
              onError={(e) => handleAgentPhotoError(e.currentTarget, agent.name || 'Agent')}
            />
          ) : (
            <div className="w-full h-full rounded-full border-2 border-white bg-gradient-burgundy shadow-sm flex items-center justify-center text-xs font-bold text-white">
              {initials(agent?.name)}
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="flex items-center gap-1 text-sm font-bold leading-tight text-ink">
            <span className="truncate">{agent?.name || 'Agent'}</span>
            <BadgeCheck className="h-[15px] w-[15px] flex-none text-gold-700" strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span className="text-[11px] text-ink/60 truncate font-medium">
            Konsultan Umroh Anda
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackPublicEvent(slug, 'wa_click_portal', { tab })}
          className="flex-shrink-0 bg-[#25D366] hover:bg-[#20BD5A] text-white px-4 py-2.5 rounded-full flex items-center gap-1.5 shadow-lg shadow-black/10 transition-all active:scale-[0.96] group"
        >
          <svg className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span className="text-xs font-bold tracking-wide">Chat WA</span>
        </a>
      </div>
    </div>
  );
}
