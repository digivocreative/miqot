import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
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
    <div className="mb-4 rounded-xl border border-white/10 shadow-lg shadow-cyan-500/20 dark:shadow-cyan-500/30 p-4 bg-gradient-to-r from-[#229ED9] to-[#1A7FB5]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <span className="absolute inset-0 rounded-full bg-white/40 animate-ping opacity-50" aria-hidden="true" />
            <div className="relative w-10 h-10 rounded-full bg-white flex items-center justify-center">
              <Send size={18} className="text-[#229ED9]" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Telegram belum terhubung</p>
            <p className="text-xs text-white/80">Aktifkan untuk terima notifikasi keberangkatan jamaah</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onConnect}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-white text-[#229ED9] text-sm font-semibold hover:bg-white/90 active:bg-white/80 transition-colors flex-shrink-0"
        >
          Hubungkan
        </button>
      </div>
    </div>
  );
}
