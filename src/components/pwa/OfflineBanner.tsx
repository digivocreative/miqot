import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

function subscribeConnectivity(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

const getOnline = () => navigator.onLine;
const getServerOnline = () => true;
const EXPANDED_MS = 6000;

// Penanda koneksi global. Saat offline, halaman tetap menampilkan data tersimpan (jadwal,
// kloter, dashboard) — pengguna perlu tahu kursi/harga yang tampil bisa bukan yang terbaru.
// Pesan lengkap tampil beberapa detik lalu menciut jadi chip kecil agar header tetap
// terpakai; ketuk chip untuk membaca pesannya lagi.
export default function OfflineBanner() {
  const online = useSyncExternalStore(subscribeConnectivity, getOnline, getServerOnline);
  const [expanded, setExpanded] = useState(true);
  const [backOnline, setBackOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setBackOnline(false);
      setExpanded(true);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBackOnline(true);
    const timer = window.setTimeout(() => setBackOnline(false), 2500);
    return () => window.clearTimeout(timer);
  }, [online]);

  useEffect(() => {
    if (online || !expanded) return;
    const timer = window.setTimeout(() => setExpanded(false), EXPANDED_MS);
    return () => window.clearTimeout(timer);
  }, [online, expanded]);

  if (online && !backOnline) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[10001] flex justify-center px-4"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      {online ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-lg">
          <Wifi size={15} aria-hidden="true" />
          <span>Kembali online</span>
        </div>
      ) : (
        <button
          type="button"
          role="status"
          aria-live="polite"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="pointer-events-auto flex min-h-[32px] items-center gap-2 rounded-full bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
        >
          <WifiOff size={15} aria-hidden="true" className="shrink-0" />
          <span>{expanded ? 'Offline — data mungkin belum terbaru' : 'Offline'}</span>
        </button>
      )}
    </div>
  );
}
