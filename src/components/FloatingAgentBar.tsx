import { useState, useEffect, useCallback, useRef } from 'react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import { isProgrammaticScrollActive } from '../lib/programmatic-scroll';
import type { AgentData } from '../data/agents';
import { AGENTS_DATA } from '../data/agents';
import { sendCapiEvent } from '../lib/capi';
import { trackPublicEvent } from '../utils/analytics';

interface FloatingAgentBarProps {
  agent: AgentData;
  /** Override slug (dipakai halaman share itinerary; default: identity lookup di AGENTS_DATA) */
  slug?: string;
  /** Override pesan WA (default: pesan umum tanya paket umroh) */
  message?: string;
  /** Override nama event analytics publik (default: wa_click_public) */
  eventName?: string;
  /** Override metadata event (default: { source: 'floating_bar' }) */
  eventMeta?: Record<string, unknown>;
  /** 'burgundy' = tona merah Alhijaz (halaman share itinerary); default hijau WA (jadwal) */
  tone?: 'default' | 'burgundy';
}

export default function FloatingAgentBar({ agent, slug, message: messageProp, eventName, eventMeta, tone = 'default' }: FloatingAgentBarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  // CAPI: get agent slug for event firing
  const agentSlug = slug || Object.entries(AGENTS_DATA).find(([, v]) => v === agent)?.[0] || '';

  // Smart Scroll Visibility
  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const lastScrollY = lastScrollYRef.current;

    // Scroll kompensasi anchor kartu, bukan gestur user — jangan munculkan bar
    // di tengah animasi pindah kartu.
    if (isProgrammaticScrollActive()) {
      lastScrollYRef.current = currentScrollY;
      return;
    }

    if (currentScrollY <= 50) {
      lastScrollYRef.current = currentScrollY;
      setIsVisible(true);
      return;
    }

    // Ambang 4px, sama alasannya dengan FilterHeader: delta sub-pixel dari momentum
    // iOS membalik arah bolak-balik dan me-restart animasi 300ms bar ini, sehingga
    // bar terlihat berkedip naik-turun saat menggulir. Hanya toggle berbasis arah
    // yang digerbangi — zona atas (≤50px) di atas tetap tanpa syarat.
    const delta = currentScrollY - lastScrollY;
    if (Math.abs(delta) < 4) return;
    lastScrollYRef.current = currentScrollY;

    // Scroll ke bawah -> sembunyi, ke atas -> muncul
    setIsVisible(delta < 0);
  }, []);

  useEffect(() => {
    // Gas rAF — event scroll iOS lebih rapat dari frame saat momentum; tanpa ini
    // setiap event memicu render React sendiri-sendiri di tengah gestur.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        handleScroll();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [handleScroll]);

  // General WA message (not package-specific) — bisa dioverride via prop
  const message = messageProp || 'Assalamualaikum, Saya mau tanya paket umroh di Alhijaz';
  const waLink = `https://wa.me/${agent.phone}?text=${encodeURIComponent(message)}`;

  const handleCtaClick = () => {
    if (agentSlug) {
      sendCapiEvent(agentSlug, 'contact');
      trackPublicEvent(agentSlug, eventName || 'wa_click_public', eventMeta || { source: 'floating_bar' });
    }
  };

  const isBurgundy = tone === 'burgundy';
  const shellTone = isBurgundy
    ? 'bg-gradient-to-r from-[#FBF3F2] via-white to-white border border-[#EAD5D3]'
    : `bg-gradient-to-r from-emerald-50 via-white to-white
       dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800
       border border-emerald-100 dark:border-emerald-800/50`;
  const ctaTone = isBurgundy
    ? 'bg-gradient-burgundy hover:brightness-110 shadow-lg shadow-[#8A0F0A]/25'
    : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20';

  return (
    <div
      className={`
        fixed bottom-6 left-4 right-4 z-50
        max-w-lg mx-auto
        ${shellTone}
        backdrop-blur-md
        shadow-2xl
        rounded-full
        flex items-center justify-between
        p-2 pl-3
        transition-[transform,opacity] duration-300 ease-in-out
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-[200%] opacity-0'}
      `}
    >
      {/* LEFT: Agent Photo & Info */}
      <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
        <div className="w-10 h-10 flex-shrink-0">
          <img
            src={agent.photo}
            alt={agent.name}
            className="w-full h-full object-cover rounded-full border-2 border-white dark:border-slate-700 shadow-sm"
            onError={(e) => handleAgentPhotoError(e.currentTarget, agent.name)}
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight flex items-center gap-1">
            <span className="truncate">{agent.name}</span>
            <svg className="w-[15px] h-[15px] flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" fill="#1DA1F2"/>
              <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="text-[11px] text-gray-500 dark:text-slate-400 truncate font-medium">
            {agent.website}
          </span>
        </div>
      </div>

      {/* RIGHT: Chat Button */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleCtaClick}
          className={`flex-shrink-0 ${ctaTone} text-white px-4 py-2.5 rounded-full flex items-center gap-1.5 transition-all active:scale-[0.96] group`}
        >
          <svg className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span className="text-xs font-bold tracking-wide">Chat</span>
        </a>
      </div>
    </div>
  );
}
