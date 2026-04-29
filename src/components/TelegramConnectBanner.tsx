import { useEffect, useState } from 'react';
import { Send, ArrowRight } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

interface TelegramStatus {
  connected: boolean;
  chatId: string | null;
  hasCredentials: boolean;
}

interface Props {
  onConnect: () => void;
}

export default function TelegramConnectBanner({ onConnect }: Props) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/telegram/status', { headers: { ...getAuthHeaders() } });
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data) {
          setStatus(json.data);
        } else {
          setStatus(null);
        }
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    fetchStatus();

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchStatus();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!loaded) return null;
  if (!status) return null;
  if (status.connected) return null;

  return (
    <div className="relative mb-4 rounded-xl border border-white/15 shadow-lg shadow-cyan-500/30 dark:shadow-cyan-500/40 p-4 bg-gradient-to-br from-[#2AA9E0] via-[#229ED9] to-[#16719E] overflow-hidden">
      {/* Decorative ornaments */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-12 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-44 h-44 rounded-full bg-cyan-200/15 blur-2xl" />
        <Send size={140} className="absolute -right-6 -bottom-8 text-white/[0.07] rotate-12" strokeWidth={1.5} />
        <div className="absolute top-3 right-24 w-1.5 h-1.5 rounded-full bg-white/40" />
        <div className="absolute top-8 right-16 w-1 h-1 rounded-full bg-white/30" />
        <div className="absolute bottom-6 left-32 w-1 h-1 rounded-full bg-white/30" />
      </div>

      <div className="relative flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <span className="absolute inset-0 rounded-full bg-white/40 animate-ping opacity-50" aria-hidden="true" />
            <div className="relative w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md shadow-black/10">
              <Send size={18} className="text-[#229ED9]" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white drop-shadow-sm">Jangan lewatkan jamaahmu!</p>
            <p className="text-xs text-white/85 mt-0.5">Notif keberangkatan langsung di Telegram.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onConnect}
          className="group w-full sm:w-auto px-4 py-2 rounded-lg bg-white text-[#229ED9] text-sm font-semibold hover:bg-white/95 active:bg-white/85 transition-colors flex-shrink-0 inline-flex items-center justify-center gap-1.5 shadow-md shadow-black/10"
        >
          <Send size={14} className="-rotate-12" />
          <span>Hubungkan</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
